const insure = require('./insure');
const select = require('./select');
const crypto = require('../crypto');
const request = require('../request');
const { getManagedCacheStorage } = require('../cache');
const url = require('url');

const format = (song) => ({
	id: song.MUSICRID.split('_').pop(),
	name: song.SONGNAME,
	duration: song.DURATION * 1000,
	album: { id: song.ALBUMID, name: song.ALBUM },
	artists: song.ARTIST.split('&').map((name, index) => ({
		id: index ? null : song.ARTISTID,
		name,
	})),
});

const generateSign = (str) => {
	const currentTime = Date.now();
	str += `&timestamp=${currentTime}`;
	const questionMarkIndex = str.indexOf('?');
	const baseUrl = str.substring(0, questionMarkIndex);
	const filteredChars = str
		.substring(questionMarkIndex + 1)
		.replace(/[^a-zA-Z0-9]/g, '')
		.split('');
	filteredChars.sort();
	const dataToEncrypt = `kuwotest${filteredChars.join('')}${url.parse(baseUrl).path}`;
	const md5 = crypto.md5.digest(dataToEncrypt);
	return `${str}&sign=${md5.toLowerCase()}`;
};

const search = (info) => {
	const keyword = encodeURIComponent(info.keyword.replace(' - ', ' '));
	const searchUrl =
		'http://search.kuwo.cn/r.s?&correct=1&stype=comprehensive&encoding=utf8' +
		'&rformat=json&mobi=1&show_copyright_off=1&searchapi=6&all=' +
		keyword;

	return request('GET', searchUrl)
		.then((response) => response.json())
		.then((jsonBody) => {
			if (
				!jsonBody ||
				jsonBody.content.length < 2 ||
				!jsonBody.content[1].musicpage ||
				jsonBody.content[1].musicpage.abslist.length < 1
			)
				return Promise.reject();
			const list = jsonBody.content[1].musicpage.abslist.map(format);
			const matched = select(list, info);
			return matched ? matched.id : Promise.reject();
		});
};

const sendAdFreeRequest = async () => {
	const adurl =
		'http://bd-api.kuwo.cn/api/service/advert/watch?uid=-1&token=&timestamp=1724306124436&sign=15a676d66285117ad714e8c8371691da';
	const headers = {
		'user-agent': 'Dart/2.19 (dart:io)',
		plat: 'ar',
		channel: 'aliopen',
		devid: '1145141145141145114',
		ver: '3.9.0',
		host: 'bd-api.kuwo.cn',
		qimei36: '1e9970cbcdc20a031dee9f37100017e1840e',
		'content-type': 'application/json; charset=utf-8',
	};
	const data = JSON.stringify({
		type: 5,
		subType: 5,
		musicId: 0,
		adToken: '',
	});
	const response = await request('POST', adurl, headers, data);
	if (typeof response.body === 'object') {
		console.log('bodian ad free response:', response.body);
	}
};
const trackKuwo = (id) => {
	const url = crypto.kuwoapi
		? 'http://mobi.kuwo.cn/mobi.s?f=kuwo&q=' +
			crypto.kuwoapi.encryptQuery(
				'corp=kuwo&source=kwplayerhd_ar_4.8.3.8_BYD_35.apk&p2p=1&type=convert_url2&sig=0&format=' +
					['flac', 'mp3']
						.slice(select.ENABLE_FLAC ? 0 : 1)
						.join('|') +
					'&rid=' +
					id
			)
		: 'http://antiserver.kuwo.cn/anti.s?type=convert_url&format=mp3&response=url&rid=MUSIC_' +
			id;
	return request('GET', url, { 'user-agent': 'okhttp/3.10.0' })
		.then((response) => response.body())
		.then((body) => {
			const url = (body.match(/http[^\s$"]+/) || [])[0];
			return url || Promise.reject();
		})
		.catch(() => insure().bodian.trackKuwo(id));
};

const track = async (id) => {
	const headers = {
		'user-agent': 'Dart/2.19 (dart:io)',
		plat: 'ar',
		channel: 'aliopen',
		devid: '1145141145141145114',
		ver: '3.9.0',
		host: 'bd-api.kuwo.cn',
		'X-Forwarded-For': '1.0.1.114',
	};
	let audioUrl = `http://bd-api.kuwo.cn/api/play/music/v2/audioUrl?&br=${
		select.ENABLE_FLAC ? '2000kflac' : '320kmp3'
	}&musicId=${id}`;
	audioUrl = generateSign(audioUrl);
	try {
		await sendAdFreeRequest();
		let response = await request('GET', audioUrl, headers);
		const body = await response.body();
		let urlMatch = (body.match(/http[^\s$"]+/) || [])[0];
		urlMatch = urlMatch.replace(/\?.*/, '');
		return urlMatch || Promise.reject();
	} catch (error) {
		return insure().bodian.trackKuwo(id);
	}
};

const cs = getManagedCacheStorage('provider/bodian');

const check = (info) => cs.cache(info, () => search(info)).then(track);

module.exports = { check, track };
