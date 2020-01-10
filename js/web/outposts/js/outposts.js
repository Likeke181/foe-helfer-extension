/*
 * **************************************************************************************
 *
 * Dateiname:                 outposts.js
 * Projekt:                   foe-chrome
 *
 * erstellt von:              Daniel Siekiera <daniel.siekiera@gmail.com>
 * erstellt am:	              22.12.19, 14:31 Uhr
 * zuletzt bearbeitet:       22.12.19, 14:31 Uhr
 *
 * Copyright © 2019
 *
 * **************************************************************************************
 */

let Outposts = {
	/** @type {FoE_JSON_CulturalOutpost[]|null} */
	OutpostsData: null,
	/** @type {FoE_JSON_CulturalOutpost|null} */
	OutpostData : null,
	
	/** @type {FoE_JSON_Advancement[]|null} */
	Advancements : null,
	
	/** @type {FoE_JSON_CityMap|null} */
	CityMap: null,
	
	// display settings
	/** @type {Record<string, Record<string, FoE_JSON_GoodName>>} */
	PlannedTiles: JSON.parse(localStorage.getItem('Outposts_PlannedTiles')||'{}'),
	GUINeedsUpdate: false,
	DisplaySums: false,
	DisplayAllTiles: false,


	/**
	 * Füg eine Box in den DOM ein
	 */
	BuildInfoBox: ()=> {

		if (Outposts.Advancements === null) {
			let OutpostBuildings = localStorage.getItem('OutpostBuildings');

			if (OutpostBuildings !== null)
			{
				Outposts.Advancements = JSON.parse(OutpostBuildings);
			}
		}

		if (Outposts.Advancements === null || Outposts.OutpostData === null) {
			return;
		}

		{
			let oldPlannedFormat = Object.values(Outposts.PlannedTiles).find(planned => typeof planned === 'string');
			if (oldPlannedFormat) {
				// @ts-ignore
				Outposts.PlannedTiles = {[Outposts.OutpostData.content]: Outposts.PlannedTiles};
			}
		}

		if( $('#outpostConsumables').length === 0 )
		{
			let args = {
				'id': 'outpostConsumables',
				'title': i18n['Boxes']['Outpost']['Title'],
				'auto_close': true,
				'dragdrop': true,
				'minimize': true
			};

			HTML.Box(args);

			HTML.AddCssFile('outposts');

			const window = /** @type {HTMLElement} */(document.getElementById('outpostConsumables'));
			window.addEventListener('change', (event) => {
				const target = /** @type {HTMLInputElement} */(event.target);
				const namePrefix = 'foe_helper_';
				if (target.tagName === 'INPUT' && target.type === 'radio' && target.checked && target.name.startsWith(namePrefix) && Outposts.OutpostData) {
					const cultureName = Outposts.OutpostData.content;
					const name = target.name.substr(namePrefix.length);
					let value = target.value;
					if (value === '#off') {
						if (Outposts.PlannedTiles[cultureName]) {
							delete Outposts.PlannedTiles[cultureName][name];
						}
					} else {
						if (!Outposts.PlannedTiles[cultureName]) {
							Outposts.PlannedTiles[cultureName] = {};
						}
						Outposts.PlannedTiles[cultureName][name] = value;
					}
					localStorage.setItem('Outposts_PlannedTiles', JSON.stringify(Outposts.PlannedTiles));
					Outposts.RequestGUIUpdate();
				}
			});

		}

		Outposts.BuildInfoBoxContent();
	},


	/**
	 * Setzt den Inhalt der Box zusammen
	 */
	BuildInfoBoxContent: () => {
		Outposts.GUINeedsUpdate = false;
		if ( !$('#outpostConsumables').is(':visible') ) {
			return;
		}
		const OutpostData = Outposts.OutpostData;
		if (Outposts.Advancements === null || OutpostData === null) {
			return;
		}

		const primaryResourceId = OutpostData.primaryResourceId;
		const resourceIDs = [...OutpostData.goodsResourceIds, 'diplomacy'];
		const advancements = Outposts.Advancements;
		const buildings = Outposts.CityMap ? Outposts.CityMap.entities : [];
		const plannedTiles = Outposts.PlannedTiles[OutpostData.content] || {};

		const currentRun = OutpostData.playthroughs.find(run => !run.isCompleted);

		const BuildingsData = JSON.parse(sessionStorage.getItem('BuildingsData')||'null');

		// Diplomatische Gebäude raussuchen, die erforscht sind
		/** @type {{name: string, diplomacy: number}[]}} */
		const UnlockedDiplomacyBuildings =
			advancements
			.filter(building => building.isUnlocked && building.rewards[0].toLocaleLowerCase().indexOf('diplomacy') > -1)
			.map(building => {
				let BuildingData = BuildingsData.find(obj => (obj.asset_id === building.rewards[0]));
				return {name: building.name, diplomacy: BuildingData.staticResources.resources.diplomacy};
			})
			.reverse()
		;

		/** @type {FoE_JSON_Goods} */
		const currStock = Object.fromEntries(resourceIDs.map(id => [id, ResourceStock[id] || 0]));

		/** @type {FoE_JSON_Goods} */
		let sums = Object.fromEntries(resourceIDs.map(id => [id, 0]));

		

		let tileSelectablePrices =
			Outposts.CityMap
			? /** @type {FoE_JSON_CityEntityTilesetSelectablePrice[]|undefined} */
			(Outposts.CityMap.tilesets.filter(t => t.available && t.type === 'selectablePrice'))
			: undefined
		;
		/** @type {null|[string, FoE_JSON_PartialGoods][]} */
		const nextTilesCosts =
			tileSelectablePrices
			? (tileSelectablePrices.map(tile => [tile.id, tile.requirements.cost.resources]))
			: null
		;

		/** @type {number} */
		const current4HProductionRate = buildings.reduce(
			/** @type {(acc: number, building: FoE_JSON_CityMapEntity) => number} */
			(acc, building) => {
				const state = building.state;
				if (!building.connected || state.__class__ !== 'ProducingState' ) {
					return acc;
				}
				const production = state.current_product;
				if (!production) return acc;
				
				if (production.__class__ === 'CityEntityProductionProduct') {
					const amount = production.product.resources[primaryResourceId];
					if (amount != null) {
						return acc + amount*(60*60*4/* 4h */)/production.production_time;
					}
				} else if (production.__class__ === 'CityEntityResourcesWithRequirementsProduct') {
					const amount = production.resources.resources[primaryResourceId];
					if (amount != null) {
						return acc + amount*(60*60*4/* 4h */)/production.production_time;
					}
				}
				return acc;
			},
			0
		);

		/** @type {boolean} */
		const displaySums = Outposts.DisplaySums;
		/** @type {boolean} */
		const displayAllTiles = Outposts.DisplayAllTiles;


		// HTML erstellen

		$('#outpostConsumablesHeader > .title').text(i18n['Boxes']['Outpost']['TitleShort'] + OutpostData.contentName);

		/** output HTML teile-liste
		 * @type {string[]}
		 */
		let t = [];

		// Kopfzeile

		// summen checkbox
		t.push('<p class="info-line"><span><label>&sum;<input type="checkbox" onclick="Outposts.asSum(this.checked)"'+(displaySums?' checked':'')+'/></label>');

		// Durchlauf Informationen
		if (currentRun) {
			t.push(
				HTML.i18nReplacer(i18n['Boxes']['Outpost']['infoLine'], {
					runNumber: (currentRun.id||0)+1,
					chanceX4: currentRun.productionBonusProbability*100
				})
			);
		}

		// Münzen und aktuelle Münz-Produktion
		t.push(
			  '</span><span><strong>'
			+ GoodsData[primaryResourceId].name + ': ' + HTML.Format(ResourceStock[primaryResourceId]||0)
			+ '</strong> (+ '
			+ (current4HProductionRate > 0 ? HTML.Format(current4HProductionRate) : '???')
			+ '/4h)'
			+ '</span>'
		);
		t.push('</p>');


		// Kosten Tabelle

		t.push('<table class="foe-table">');

		// kosten für die nächste(n) Erweiterung(en)
		if (nextTilesCosts) {
			let i = 0;
			for (let [tileID, tileCost] of nextTilesCosts) {
				t.push('<tr>');

				if (i === 0) {
					t.push(
						'<td>'
						+ '<input type="checkbox" onclick="Outposts.listAllTiles(this.checked)"'+(displayAllTiles?' checked':'')+'/>'
						+ i18n['Boxes']['Outpost']['nextTile']
						+ '</td>'
					);
				} else {
					t.push('<td>+'+i+'</td>');
				}
				t.push('<td></td>');

				// Güter durchgehen
				for (let resourceID of resourceIDs) {
					if (resourceID === 'diplomacy' && displayAllTiles) {
						t.push('<td class="text-center">'
							+ '<label><input type="radio" value="#off" name="foe_helper_'+tileID+'" '
							+ (plannedTiles[tileID] == null ? ' checked' : '')
							+ '/><span class="outpost_tile_off">'+i18n['Boxes']['Outpost']['tileNotPlanned']+'</span></label>'
							+ '</td>'
						);
					} else {
						const cost = tileCost[resourceID];
						if (cost != null) {
							const canPurchase = currStock[resourceID] >= cost;
							const isPlanned = plannedTiles[tileID]===resourceID;
							if (displayAllTiles) {
								t.push(
									  '<td class="text-center'+(canPurchase?' text-success':'')+'">'
									+ '<label><input type="radio" value="'+resourceID+'" name="foe_helper_'+tileID+'"'
									+ (isPlanned?' checked':'')
									+ '/><span>'
									+ cost
									+ '</span></label>'
									+ '</td>'
								);
							} else {
								t.push(
									'<td class="text-center'+(canPurchase?' text-success':'')+(isPlanned?' selected':'')+'">'
									+ cost
									+ '</td>'
								);
							}
						} else {
							t.push('<td></td>');
						}
					}
				}

				t.push('</tr>');

				if (!displayAllTiles) break;
				i++;
			}
		}


		// Überschriften
		t.push('<tr>');
		t.push('<th>' + i18n['Boxes']['Outpost']['TitleBuildings'] + '</th>');
		t.push('<th class="text-center">' + i18n['Boxes']['Outpost']['TitleFree'] + '</th>');

		// Güter durchgehen
		for(let resourceID of resourceIDs){
			t.push('<th class="text-center">' + GoodsData[resourceID].name + '</th>');
		}

		t.push('</tr>');


		// Freiuschaltungen
		for (let advancement of advancements) {
			let unlocked = advancement.isUnlocked;

			t.push('<tr>');

			t.push('<td>' + advancement.name + '</td>');

			// X oder Haken
			t.push('<td class="text-center">' + (unlocked ? '&#10004;' : '&#10060;') + '</td>');

			let cost = advancement.requirements.resources;

			for (let resourceID of resourceIDs) {
				const resourceCost = cost[resourceID];
				const resourceInStock = currStock[resourceID];
				
				if (resourceCost == null || resourceCost <= 0) {
					t.push('<td></td>');
					continue;
				}

				t.push('<td class="text-center">');
				
				if (unlocked) {
					// bereits erforscht
					t.push('<span class="text-muted">' + cost[resourceID] + '</span>');
					t.push('</td>');
					continue;
				}

				const resourceSumBefore = sums[resourceID];
				const resourceSumAfter = resourceID === 'diplomacy' ? resourceCost : resourceSumBefore + resourceCost;
				sums[resourceID] = resourceSumAfter;
				
				const displayVal = displaySums && resourceID !== 'diplomacy' ? resourceSumAfter : resourceCost;
				
				if (resourceInStock < resourceSumBefore) {
					t.push(""+displayVal);
				} else {
					if (resourceInStock >= resourceSumAfter) {
						// Es sind genug Güter vorhanden.
						t.push('<span class="text-success">' +displayVal + '</span>' );
					} else {
						// Es sind nicht genug Güter vorhanden.
						t.push(displayVal + ' <small class="text-danger">' + (resourceInStock - resourceSumAfter) + '</small>' );
					}

					// Empfehlung für Diplomatie
					if (resourceID === 'diplomacy') {
						/** @type {string[]} */
						let content = [];
						/** @type {number} */
						let rest = resourceSumAfter - resourceInStock;

						if (rest > 0) {
							UnlockedDiplomacyBuildings.forEach((item, i)=> {

								// letzte Element des Arrays
								if (i === UnlockedDiplomacyBuildings.length-1 && rest > 0){
									let c = Math.ceil(rest / item['diplomacy']);
									content.push(c + 'x ' + item['name']);

								} else {
									let c = Math.floor(rest / item['diplomacy']);

									// passt in den Rest
									if(c > 0) {
										rest -= (item['diplomacy'] * c);
										content.push(c + 'x ' + item['name']);
									}
								}
							});

							t.push('<span class="diplomacy-ask">?<span class="diplomacy-tip">' + content.join('<br>') + '</span></span>');
						}
					}
				}
				
				t.push('</td>');
			}

			t.push('</tr>');
		}

		// Extra Tiles
		if (nextTilesCosts) {
			let found = false;
			const plannedTilesCostSum = nextTilesCosts.reduce(
				(acc, [id, cost]) => {
					const good = plannedTiles[id];
					if (good) {
						found = true;
						acc[good] += cost[good]||0;
					}
					return acc;
				},
				Object.fromEntries(resourceIDs.map(id => [id, 0]))
			);

			if (found) {
				t.push('<tr class="total-row">');

				t.push('<td><strong>' + i18n['Boxes']['Outpost']['ExpansionsSum'] + '</strong></td><td></td>');

				for (let resourceID of resourceIDs) {
					const resourceCost = plannedTilesCostSum[resourceID];
					if (resourceCost > 0) {
						const resourceInStock = currStock[resourceID];
						
						const resourceSumBefore = sums[resourceID];
						const resourceSumAfter = resourceID === 'diplomacy' ? resourceCost : resourceSumBefore + resourceCost;
						sums[resourceID] = resourceSumAfter;
						
						const displayVal = displaySums ? resourceSumAfter : resourceCost;
						
						t.push('<td class="text-center">');
						if (resourceInStock < resourceSumBefore) {
							t.push(""+displayVal);
						} else {
							if (resourceInStock >= resourceSumAfter) {
								// Es sind genug Güter vorhanden.
								t.push('<span class="text-success">' +displayVal + '</span>' );
							} else {
								// Es sind nicht genug Güter vorhanden.
								t.push(displayVal + ' <small class="text-danger">' + (resourceInStock - resourceSumAfter) + '</small>' );
							}
						}
						t.push('</td>');

					} else {
						t.push('<td></td>');
					}
				}

				t.push('</tr>');
			}
		}

		
		// Benötigt
		t.push('<tr class="total-row">');

		t.push('<td>' + i18n['Boxes']['Outpost']['DescRequired'] + '</td><td></td>');

		for (let resourceID of resourceIDs) {
			if (resourceID !== 'diplomacy') {
				t.push('<td class="text-center">' + HTML.Format(sums[resourceID]) + '</td>');
			} else {
				t.push('<td></td>');
			}
		}

		t.push('</tr>');

		// Vorhanden
		t.push('<tr class="resource-row">');

		t.push('<td>' + i18n['Boxes']['Outpost']['DescInStock'] + '</td><td></td>');

		for (let resourceID of resourceIDs) {
			t.push('<td class="text-center">' + currStock[resourceID] + '</td>');
		}

		t.push('</tr>');


		// Überschuss/Fehlt
		t.push('<tr class="total-row">');

		t.push('<td><strong>' + i18n['Boxes']['Outpost']['DescStillMissing'] + '</strong></td><td colspan=""></td>');

		for (let resourceID of resourceIDs) {
			if (resourceID !== 'diplomacy') {
				let diference = currStock[resourceID] - sums[resourceID];

				t.push('<td class="text-center text-' + (diference < 0 ? 'danger' : 'success') + '">' + diference + '</td>');

			} else {
				t.push('<td></td>');
			}
		}

		t.push('</tr>');


		t.push('</table>');


		$('#outpostConsumablesBody').html(t.join(''));
	},


	UpdateOutpostData: () => {
		const outposts = Outposts.OutpostsData;
		if (!outposts) return;
		
		/** @type {number} */
		let LastStartedTime = 0;
		
		let currentOutpost = outposts.find(
			outpost => outpost.startedAt !== undefined && outpost.startedAt > LastStartedTime
		);
		
		if (currentOutpost) {
			let OldOutpostType = localStorage.getItem('OutpostType'),
				NewOutpostType = currentOutpost.content;
				
			if (OldOutpostType === undefined || OldOutpostType !== NewOutpostType) {
				localStorage.setItem('OutpostType', NewOutpostType);
				localStorage.removeItem('OutpostBuildings'); //Typ des Außenpostens hat sich geändert => Gebäude löschen => führt dazu, dass Button erst nach dem Besuch des Außenpostens grün wird
				Outposts.Advancements = null;
		}
		
			Outposts.OutpostData = currentOutpost;
			Outposts.RequestGUIUpdate();
		} else {
			Outposts.OutpostData = null;
			$('#outpostConsumables').hide('fast', ()=>{
				$('#outpostConsumables').remove();
			});
			$('#outPostBtn').addClass('hud-btn-red');
		}
	},


	/**
	 * Sucht die benötigten Resources für den Außenposten heraus
	 * 
	 * @returns {void}
	 */
    CollectResources: () => {
        if (Outposts.OutpostData === null) return; //Kein Außenposten aktiv
		Outposts.RequestGUIUpdate();
	},


	/**
	 * Sammelt die Güter des Außenpostens ein und färbt den Button grün
	 *
	 * @param {FoE_JSON_Advancement[]} d
	 */
	SaveBuildings: (d)=>{
        localStorage.setItem('OutpostBuildings', JSON.stringify(d));

		Outposts.Advancements = d;

		$('#outPW').remove();
		$('#outPostBtn').removeClass('hud-btn-red');
		Outposts.RequestGUIUpdate();
	},


	/**
	 * Setzt ob die Kosten der Freischaltungen aufsummiert werden sollen.
	 * @param {boolean} shouldDisplaySum
	 */
	asSum: (shouldDisplaySum) => {
		if (Outposts.DisplaySums !== shouldDisplaySum) {
			Outposts.DisplaySums = shouldDisplaySum;
			Outposts.RequestGUIUpdate();
		}
	},


	/**
	 * Setzt ob die Kosten der Freischaltungen aufsummiert werden sollen.
	 * @param {boolean} shouldDisplayAllTiles
	 */
	listAllTiles: (shouldDisplayAllTiles) => {
		if (Outposts.DisplayAllTiles !== shouldDisplayAllTiles) {
			Outposts.DisplayAllTiles = shouldDisplayAllTiles;
			Outposts.RequestGUIUpdate();
		}
	},


	/**
	 * Bei sichtbarer Anzeige sorgt ein aufruf dieser Funktion dafür,
	 * dass die Anzeige zum nächsten Frame neu generiert wird.
	 * 
	 * @returns {void}
	 */
	RequestGUIUpdate: () => {
		if( $('#outpostConsumables').is(':visible') ) {
			if (!Outposts.GUINeedsUpdate) {
				Outposts.GUINeedsUpdate = true;
				requestAnimationFrame(Outposts.BuildInfoBoxContent);
			}
		}
	},


	Extensions: ()=> {
		return {
			vikings: {
				1: {axes: 1, mead: 1, horns: 1, wool: 1},
				2: {axes: 5, mead: 1, horns: 1, wool: 1},
				3: {axes: 12, mead: 1, horns: 1, wool: 1},
				4: {axes: 21, mead: 5, horns: 1, wool: 1},
				5: {axes: 32, mead: 12, horns: 1, wool: 1},
				6: {axes: 41, mead: 21, horns: 5, wool: 1},
				7: {axes: 48, mead: 32, horns: 12, wool: 1},
				8: {axes: 55, mead: 41, horns: 21, wool: 5},
				9: {axes: 62, mead: 48, horns: 32, wool: 12},
				10: {axes: 69, mead: 55, horns: 41, wool: 21},
				11: {axes: 76, mead: 62, horns: 48, wool: 32},
				12: {axes: 82, mead: 69, horns: 55, wool: 41},
				13: {axes: 89, mead: 76, horns: 62, wool: 48},
				14: {axes: 96, mead: 82, horns: 69, wool: 55},
				15: {axes: 103, mead: 89, horns: 76, wool: 62},
				16: {axes: 110, mead: 69, horns: 82, wool: 69}
			},
			japanese: {
				1: {soy: 8, paintings: 8, armor: 8, instruments: 8},
				2: {soy: 19, paintings: 8, armor: 8, instruments: 8},
				3: {soy: 31, paintings: 19, armor: 8, instruments: 8},
				4: {soy: 46, paintings: 31, armor: 8, instruments: 8},
				5: {soy: 51, paintings: 46, armor: 19, instruments: 8},
				6: {soy: 56, paintings: 51, armor: 31, instruments: 8},
				7: {soy: 60, paintings: 56, armor: 46, instruments: 19},
				8: {soy: 65, paintings: 60, armor: 51, instruments: 31},
				9: {soy: 70, paintings: 65, armor: 56, instruments: 46},
				10: {soy: 74, paintings: 70, armor: 60, instruments: 51},
				11: {soy: 79, paintings: 74, armor: 65, instruments: 56},
				12: {soy: 84, paintings: 79, armor: 70, instruments: 60}
			}
		};
	}
};

/** @type {any} */(globalThis).Outposts = Outposts;

// --------------------------------------------------------------------------------------------------
// Verarbeiter für Außenposten Daten:

// Alle Typen der Außenposten "notieren"
FoEproxy.addHandler('OutpostService', 'getAll', (/** @type {FoE_NETWORK_OutpostService_getAll} */ data, _postData) => {
	// store all informations in case of outpost change
	Outposts.OutpostsData = data.responseData;
	Outposts.UpdateOutpostData();
});

FoEproxy.addHandler('OutpostService', 'start', (/** @type {FoE_NETWORK_OutpostService_start} */ data, _postData) => {
	// store changed informations
	const culture = data.responseData;
	const content = culture.content;
	let idx = Outposts.OutpostsData.findIndex(c => c.content === content);
	if (idx !== -1) {
		Outposts.OutpostsData[idx] = culture;
	} else {
		Outposts.OutpostsData.push(culture);
	}
	Outposts.UpdateOutpostData();
});

// OutpostService.cancel wird von einem OutpostService.getAll gefolgt



// Gebäude des Außenpostens sichern
FoEproxy.addHandler('AdvancementService', 'getAll', (/** @type {FoE_NETWORK_AdvancementService_getAll} */data, _postData) => {
	Outposts.SaveBuildings(data.responseData);
});

// eine Forschung Freischalten
FoEproxy.addHandler('AdvancementService', 'unlock', (/** @type {FoE_NETWORK_AdvancementService_unlock} */data, postData) => {
	if (postData instanceof Array) {
		postData = postData.find(request => request.requestClass === 'AdvancementService' && request.requestMethod === 'unlock');
	}
	if (postData && data.responseData.__class__ === 'Success' && Outposts.Advancements) {
		let advancement = Outposts.Advancements.find(advancement => !advancement.isUnlocked);
		if (advancement) {
			advancement.isUnlocked = true;
			Outposts.RequestGUIUpdate();
		}
	}
});


// Status der Gebäude updaten
FoEproxy.addHandler('CityProductionService', 'startProduction', (/** @type {FoE_NETWORK_CityProductionService_startProduction} */data, _postData) => {
	const cityMap = Outposts.CityMap;
	if (!cityMap) {
		return;
	}
	const cityMapEntities = cityMap.entities;
	let changed = false;
	for (let entry of data.responseData.updatedEntities) {
		const searchID = entry.id;
		const idx = cityMapEntities.findIndex(e => e.id === searchID);
		if (idx >= 0) {
			cityMapEntities[idx] = entry;
			changed = true;
		}
	}
	if (changed) {
		Outposts.RequestGUIUpdate();
	}
});

FoEproxy.addHandler('CityMapService', 'getCityMap', (/** @type {FoE_NETWORK_CityMapService_getCityMap} */data, _postData) => {
	const response = data.responseData;
	if (response.gridId === 'cultural_outpost') {
		Outposts.CityMap = data.responseData;
		Outposts.RequestGUIUpdate();
	}
});

FoEproxy.addHandler('CityMapService', 'placeExpansion', (/** @type {FoE_NETWORK_CityMapService_placeExpansion} */data, postData) => {
	// TODO: update city layout Data
	const city = Outposts.CityMap;
	if (city) {
		const tilesets = city.tilesets;
		if (postData instanceof Array) {
			// API-Compatobilität: falls noch alle anfragen gelistet werden, suche die richtige Anfrage raus
			postData = postData.find(post => post.requestClass === 'CityMapService' && post.requestMethod === 'placeExpansion');
		}
		if (postData) {
			// suche die gekaufte erweiterung
			const type = postData.requestData[0].type;
			const idx = tilesets.findIndex(tile => tile.type === type);
			if (idx >= 0) {
				// entferne die gekaufte Erweiterung aus der liste der kaufbaren Erweiterungen
				tilesets.splice(idx, 1);
				Outposts.RequestGUIUpdate();
			}
		}
	}
});


FoEproxy.addHandler('CityMapService', 'removeBuilding', (/** @type {FoE_NETWORK_CityMapService_removeBuilding} */data, postData) => {
	const city = Outposts.CityMap;
	if (city) {
		const entities = city.entities;
		if (postData instanceof Array) {
			// API-Compatobilität: falls noch alle anfragen gelistet werden, suche die richtige Anfrage raus
			postData = postData.find(post => post.requestClass === 'CityMapService' && post.requestMethod === 'removeBuilding');
		}
		if (postData) {
			postData.requestData.forEach(removedID => {
				const idx = entities.findIndex(tile => (tile.id||0) === (removedID||0));
				if (idx >= 0) {
					// entferne das gelöschte gebäude
					entities.splice(idx, 1);
					Outposts.RequestGUIUpdate();
				}
			});
			data.responseData.forEach(building => {
				Outposts.updateBuilding(building);
			});
		}
	}});

