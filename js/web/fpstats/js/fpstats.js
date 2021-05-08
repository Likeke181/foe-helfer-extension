/*
 * **************************************************************************************
 * Copyright (C) 2021 FoE-Helper team - All Rights Reserved
 * You may use, distribute and modify this code under the
 * terms of the AGPL license.
 *
 * See file LICENSE.md or go to
 * https://github.com/dsiekiera/foe-helfer-extension/blob/master/LICENSE.md
 * for full license details.
 *
 * **************************************************************************************
 */


/**
 * @type {{maxDateFilter, CityMapDataNew: null, buildBody: (function(): Promise<void>), currentDateFilter, calculateTotalByType: (function(*=): number), ShowFPStatsBox: (function(): Promise<void>), calculateTotal: (function(): number), TodayEntries: null, lockDates: [], ToggleHeader: FPStats.ToggleHeader, intiateDatePicker: (function(): Promise<void>), getPossibleEventsByDate: (function(): []), DatePicker: null, HandleAdvanceQuest: FPStats.HandleAdvanceQuest, minDateFilter: null}}
 */
let FPStats = {

	minDateFilter: null,
	maxDateFilter: moment(MainParser.getCurrentDate()).toDate(),
	currentDateFilter: moment(MainParser.getCurrentDate()).format('YYYY-MM-DD'),

	CityMapDataNew: null,

	lockDates: [],
	TodayEntries: null,

	DatePicker: null,


	/**
	 * Create the box and wrappers for the content
	 *
	 * @returns {Promise<void>}
	 * @constructor
	 */
	Box: async ()=> {

		if( $('#fpstats').length < 1 )
		{
			FPStats.DatePicker = null;

			// CSS into the DOM
			HTML.AddCssFile('fpstats');

			HTML.Box({
				id: 'fpstats',
				title: i18n('Menu.fpstats.Title'),
				auto_close: true,
				dragdrop: true,
				resize: true,
				minimize: true
			});

			let startMoment = null,
				endMoment = null;

			// set the first possible date for date picker
			await IndexDB.db['invests'].orderBy('id').first().then((resp) => {
				startMoment = moment(resp.date).startOf('day');
				FPStats.minDateFilter = startMoment.toDate();

			}).catch(() => {
				FPStats.minDateFilter = moment(MainParser.getCurrentDate()).startOf('day').toDate();
			});

			// set the last known date
			await IndexDB.db['invests'].orderBy('id').last().then((resp) => {
				endMoment = moment(resp.date).add(1, 'day'); // neccesary to include the current day
				FPStats.maxDateFilter = moment(resp.date).endOf('day').toDate();

			}).catch(() => {

			});

			// get all days without entries and block them in the Litepicker
			let hidePicker = false;
			if(startMoment && endMoment)
			{
				while (startMoment.isBefore(endMoment, 'day'))
				{
					let checkDate = await IndexDB.db['invests'].where('date').equals(moment(startMoment).format('YYYY-MM-DD')).toArray();

					if(checkDate.length === 0){
						FPStats.lockDates.push(moment(startMoment).format('YYYY-MM-DD'));
					}
					startMoment.add(1, 'days');
				}
			}
			else {
				// is any entry present?
				let checkPresent = await IndexDB.db['invests'].toArray();

				// no? hide the datepicker button
				if (checkPresent.length === 0) hidePicker = true;
			}

			$('#fpstatsBody').append(
				`<div class="dark-bg head">
					<div class="text-warning"><strong>${i18n('Boxes.fpstats.TotalFP')} <span id="fpstats-total-fp"></span></strong></div>
					<div class="text-right"><button class="btn btn-default" id="FPStatsPicker">${moment(FPStats.currentDateFilter).format(i18n('Date'))}</button></div>
				</div>`,
				`<div id="fpstatsBodyInner"></div>`
			);

			if (hidePicker) $('#FPStatsPicker').hide();
		}
		else {
			HTML.CloseOpenBox('fpstats');
			return;
		}

		await FPStats.buildBody();
	},


	/**
	 * Create the box content
	 *
	 * @returns {Promise<void>}
	 */
	buildBody: async ()=> {

		let tr = [];
		FPStats.TodayEntries = await IndexDB.db['invests'].where('date').equals(FPStats.currentDateFilter).toArray();

		let totalFPDummy = 12345
		$('#fpstats-total-fp').text(totalFPDummy);

		if(FPStats.TodayEntries.length === 0)
		{
			tr.push(`<div class="text-center" style="padding:15px"><em>${i18n('Boxes.fpstats.NoEntriesFound')}</em></div>`);
		}
		else {

			const types = FPStats.getPossibleEventsByDate();

			for (const type of types)
			{
				const sumTotal = await FPStats.calculateTotalByType(type);
				const entriesEvent = await IndexDB.db['invests'].where({date: FPStats.currentDateFilter, type: type}).toArray();

				tr.push(`<div class="foehelper-accordion ${type}">`);

				tr.push(	`<div class="foehelper-accordion-head game-cursor ${type}-head" onclick="FPStats.ToggleHeader('${type}')">
								<strong class="text-warning">${sumTotal}</strong>
								<span>${i18n('Boxes.fpstats.' + type)}</span>
							</div>`);

				tr.push(	`<div class="foehelper-accordion-body ${type}-body">`);

				 entriesEvent.forEach(e => {
					 tr.push(`<div>
								<span class="fps">${e.amount}</span>
								<span class="desc">${i18n('Boxes.fpstats.' + e.type)}</span>
								<span class="building">${e.notes ? e.notes : ''}</span>
						</div>`);
				 });

				tr.push(	`</div>`);
				tr.push(`</div>`);
			}
		}


		$('#fpstatsBodyInner').html(tr.join('')).promise().done(function(){
			FPStats.intiateDatePicker();
		});
	},


	calculateTotalByType: async (type)=> {
		let totalFPByType = 0;

		await IndexDB.db['invests']
			.where({
				date: FPStats.currentDateFilter,
				type: type
			})
			.each(entry => totalFPByType += entry.amount)
		;

		return totalFPByType;
	},


	/**
	 * Initatite the Litepicker object
	 *
	 * @returns {Promise<void>}
	 */
	intiateDatePicker: async () => {

		if(FPStats.DatePicker !== null){
			return ;
		}
		console.log("FPStats.minDateFilter: " + FPStats.minDateFilter);
		console.log("FPStats.maxDateFilter: " + FPStats.maxDateFilter);
		FPStats.DatePicker = new Litepicker({
			element: document.getElementById('FPStatsPicker'),
			format: i18n('Date'),
			lang: MainParser.Language,
			singleMode: false,
			splitView: false,
			numberOfMonths: 1,
			numberOfColumns: 1,
			autoRefresh: true,
			lockDays: FPStats.lockDates,
			minDate: FPStats.minDateFilter,
			maxDate: FPStats.maxDateFilter,
			showWeekNumbers: false,
			onSelect: async (date)=> {
				$('#FPStatsPicker').text(`${moment(date).format(i18n('Date'))}`);

				FPStats.currentDateFilter = moment(date).format('YYYY-MM-DD');
				await FPStats.buildBody();
			}
		});
	},


	getPossibleEventsByDate: ()=> {
		let available = [];

		FPStats.TodayEntries.forEach(e => {
			if(!available.includes(e['type']))
			{
				available.push(e['type'])
			}
		});

		return available;
	},


	ToggleHeader: (type)=> {
		let $this = $(`.${type}`),
			isOpen = $this.hasClass('open');

		$('#fpstatsBodyInner .foehelper-accordion').removeClass('open');

		if(!isOpen){
			$this.addClass('open');
		}
	}
};