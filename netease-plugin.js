const axios = require('axios');
const CryptoJS = require('crypto-js');
const bigInt = require('big-integer');
const qs = require('qs');

// === 加密配置 ===
const presetKey = '0CoJUm6Qyw8W8jud';
const iv = '0102030405060708';
const publicKey = '010001';
const modulus = '00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3fb17ba88a51d2ea6e6c1e34e22997791b474795c643752e2a0ca51d5300f250325990264020a6713993a40128911571f37996c5ac2c4883f3e792e92c27b0337d197607a7500e576971a7a020165842813583090845610a5639f7833501f7c083';
const eapiKey = 'e82ckenh8dichen8';

// === 加密核心函数 ===
function aesEncrypt(data, key) {
    return CryptoJS.AES.encrypt(data, CryptoJS.enc.Utf8.parse(key), {
        iv: CryptoJS.enc.Utf8.parse(iv),
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
    });
}

function rsaEncrypt(text, key, modulus) {
    const reversedText = text.split('').reverse().join('');
    const m = bigInt(modulus, 16);
    const e = bigInt(key, 16);
    let val = bigInt(0);
    for (let i = 0; i < reversedText.length; i++) {
        val = val.multiply(256).add(reversedText.charCodeAt(i));
    }
    return val.modPow(e, m).toString(16).padStart(256, '0');
}

function weapi(data) {
    const text = JSON.stringify(data);
    const characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let randomKey = '';
    for (let i = 0; i < 16; i++) {
        randomKey += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    const aes1 = aesEncrypt(CryptoJS.enc.Utf8.parse(text), presetKey);
    const aes2 = aesEncrypt(aes1.ciphertext, randomKey);
    return {
        params: aes2.toString(),
        encSecKey: rsaEncrypt(randomKey, publicKey, modulus)
    };
}

function eapi(path, data) {
    const text = typeof data === 'object' ? JSON.stringify(data) : data;
    const params = [path, text];
    const digest = CryptoJS.MD5("nobody" + params.join("use") + "md5forencrypt").toString();
    const dataToEncrypt = params.join("-36cd479b6b5-") + "-36cd479b6b5-" + digest;
    const encrypted = CryptoJS.AES.encrypt(CryptoJS.enc.Utf8.parse(dataToEncrypt), CryptoJS.enc.Utf8.parse(eapiKey), {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.Pkcs7
    });
    return { params: encrypted.ciphertext.toString(CryptoJS.enc.Hex).toUpperCase() };
}

const commonHeaders = {
    'Referer': 'https://music.163.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
};

async function postWeapi(url, data, cookie) {
    const csrfToken = cookie?.match(/__csrf=([^;]+)/)?.[1] || '';
    const res = await axios.post(
        `${url}${url.includes('?') ? '&' : '?'}csrf_token=${csrfToken}`,
        qs.stringify(weapi({ ...data, csrf_token: csrfToken })),
        {
            headers: {
                ...commonHeaders,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': cookie || ''
            }
        }
    );
    return res.data;
}

async function postEapi(url, path, data, cookie) {
    const res = await axios.post(url, qs.stringify(eapi(path, data)), {
        headers: {
            ...commonHeaders,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': cookie || ''
        }
    });
    return res.data;
}

// === 辅助转换 ===
function mapMusicItem(item) {
    const ar = item.ar || item.artists || [];
    const al = item.al || item.album || {};
    return {
        id: String(item.id),
        title: item.name,
        artist: ar.map(a => a.name).join('/'),
        album: al.name || '',
        artwork: al.picUrl || (al.picId ? `https://p1.music.126.net/${al.picId}/${al.picId}.jpg` : ''),
        duration: (item.dt || item.duration) / 1000
    };
}

module.exports = {
    platform: '网易云音乐-账户版',
    version: '0.3.7',
    author: 'pbdm',
    description: '修正版：还原核心通信逻辑解决播放问题，支持排行榜与自建歌单',
    supportedSearchType: ['music', 'album', 'artist', 'sheet'],
    userVariables: [
        { key: 'cookie', name: 'Cookie', hint: '请输入包含 MUSIC_U 的 Cookie' }
    ],

    // === 搜索 ===
    async search(query, page, type) {
        const cookie = (env.getUserVariables() || {}).cookie || '';
        const searchTypeMap = { 'music': 1, 'album': 10, 'artist': 100, 'sheet': 1000 };
        const res = await axios.get('https://music.163.com/api/search/get', {
            params: { s: query, type: searchTypeMap[type] || 1, limit: 30, offset: (page - 1) * 30 },
            headers: { ...commonHeaders, Cookie: cookie }
        });
        const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
        const result = data.result;
        if (!result) return { isEnd: true, data: [] };

        let list = [];
        if (type === 'music') list = (result.songs || []).map(mapMusicItem);
        else if (type === 'album') list = (result.albums || []).map(item => ({ id: String(item.id), title: item.name, artist: item.artists.map(a => a.name).join('/'), artwork: item.picUrl }));
        else if (type === 'artist') list = (result.artists || []).map(item => ({ id: String(item.id), title: item.name, artwork: item.picUrl }));
        else if (type === 'sheet') list = (result.playlists || []).map(item => ({ id: String(item.id), title: item.name, artist: item.creator.nickname, artwork: item.coverImgUrl }));

        return { isEnd: list.length < 30, data: list };
    },

    // === 发现/推荐 ===
    async getRecommendMusic() {
        const cookie = (env.getUserVariables() || {}).cookie || '';
        const result = [];

        if (cookie) {
            result.push({
                title: '账户专属',
                data: [
                    { id: 'daily_recommend', title: '每日歌曲推荐', artwork: 'https://p1.music.126.net/06vU_T-7_W260uK7mX9U-A==/109951165671182690.jpg', description: '根据口味每天6:00更新' }
                ]
            });

            try {
                const accountRes = await axios.get('https://music.163.com/api/nuser/account/get', { headers: { ...commonHeaders, Cookie: cookie } });
                const accountData = typeof accountRes.data === 'string' ? JSON.parse(accountRes.data) : accountRes.data;
                const uid = accountData.account?.id || accountData.profile?.userId;
                if (uid) {
                    const res = await axios.get(`https://music.163.com/api/user/playlist?uid=${uid}&limit=50`, { headers: { ...commonHeaders, Cookie: cookie } });
                    const playlistData = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
                    const list = playlistData.playlist || playlistData.playlists || [];
                    if (list.length > 0) {
                        result.push({
                            title: '我的歌单',
                            data: list.map(p => ({
                                id: String(p.id), title: p.name, artist: p.creator?.nickname || '', artwork: p.coverImgUrl
                            }))
                        });
                    }
                }
            } catch (e) {}
        }

        try {
            const hotRes = await axios.get('https://music.163.com/api/playlist/list', { 
                params: { cat: '全部', order: 'hot', limit: 18 }, 
                headers: commonHeaders 
            });
            const data = typeof hotRes.data === 'string' ? JSON.parse(hotRes.data) : hotRes.data;
            if (data && data.playlists) {
                result.push({
                    title: '热门歌单',
                    data: data.playlists.map(p => ({
                        id: String(p.id), title: p.name, artist: p.creator.nickname, artwork: p.coverImgUrl
                    }))
                });
            }
        } catch (e) {}

        return result;
    },

    // === 歌单/专辑 详情 ===
    async getMusicSheetInfo(sheetItem, page) {
        const cookie = (env.getUserVariables() || {}).cookie || '';

        if (sheetItem.id === 'daily_recommend') {
            if (page > 1) return { isEnd: true, musicList: [] };
            const res = await postEapi('https://music.163.com/eapi/v1/discovery/recommend/songs', '/api/v1/discovery/recommend/songs', { offset: 0, total: true, limit: 100 }, cookie);
            const data = typeof res === 'string' ? JSON.parse(res) : res;
            const list = (data.data?.dailySongs || data.dailySongs || []).map(mapMusicItem);
            return { isEnd: true, musicList: list };
        }

        const pageSize = 50;
        const res = await axios.get('https://music.163.com/api/v6/playlist/detail', { params: { id: sheetItem.id, n: 1 }, headers: { ...commonHeaders, Cookie: cookie } });
        const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
        const playlist = data.playlist;
        if (!playlist || !playlist.trackIds) return { isEnd: true, musicList: [] };

        const start = (page - 1) * pageSize;
        const ids = playlist.trackIds.map(t => t.id).slice(start, start + pageSize);
        if (ids.length === 0) return { isEnd: true, musicList: [] };

        const res2 = await axios.get('https://music.163.com/api/v3/song/detail', {
            params: { c: JSON.stringify(ids.map(id => ({ id }))), ids: JSON.stringify(ids) },
            headers: { ...commonHeaders, Cookie: cookie }
        });
        const data2 = typeof res2.data === 'string' ? JSON.parse(res2.data) : res2.data;

        return {
            isEnd: start + ids.length >= playlist.trackIds.length,
            musicList: (data2.songs || []).map(mapMusicItem),
            sheetItem: page === 1 ? { title: playlist.name, artwork: playlist.coverImgUrl, description: playlist.description } : undefined
        };
    },

    async getAlbumInfo(albumItem) {
        const cookie = (env.getUserVariables() || {}).cookie || '';
        const res = await axios.get(`https://music.163.com/api/v1/album/${albumItem.id}`, { headers: { ...commonHeaders, Cookie: cookie } });
        const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
        return { isEnd: true, musicList: (data.songs || []).map(mapMusicItem), albumItem: { artwork: data.album.picUrl, description: data.album.description } };
    },

    // === 评论 ===
    async getMusicComments(musicItem, page) {
        const cookie = (env.getUserVariables() || {}).cookie || '';
        const res = await postEapi('https://interface3.music.163.com/eapi/v2/resource/comments', '/api/v2/resource/comments', {
            threadId: "R_SO_4_" + musicItem.id,
            cursor: String((page - 1) * 20),
            sortType: "1",
            pageNo: page,
            pageSize: "20",
            parentCommentId: "0",
            showInner: false
        }, cookie);

        const data = typeof res === 'string' ? JSON.parse(res) : res;
        const comments = (data.comments || []).map(c => ({
            id: String(c.commentId),
            content: c.content,
            nickName: c.user.nickname,
            avatar: c.user.avatarUrl,
            createAt: c.time,
            like: c.likedCount,
            location: c.ipLocation?.location
        }));

        return { isEnd: data.hasMore === false, data: comments };
    },

    // === 播放源 ===
    async getMediaSource(musicItem, quality) {
        const cookie = (env.getUserVariables() || {}).cookie || '';
        const qualityMap = { low: 'standard', standard: 'higher', high: 'exhigh', super: 'lossless' };
        // 关键点：将 ID 转为数字
        const songId = Number(musicItem.id);
        const res = await postWeapi('https://music.163.com/weapi/song/enhance/player/url/v1', { ids: [songId], level: qualityMap[quality] || 'standard', encodeType: 'mp3' }, cookie);
        
        const data = typeof res === 'string' ? JSON.parse(res) : res;
        if (data.data?.[0]?.url) return { url: data.data[0].url };
        
        const res2 = await axios.get('https://music.163.com/api/song/enhance/player/url', { params: { ids: `[${songId}]`, br: 320000 }, headers: { ...commonHeaders, Cookie: cookie } });
        const data2 = typeof res2.data === 'string' ? JSON.parse(res2.data) : res2.data;
        if (data2.data?.[0]?.url) return { url: data2.data[0].url };
        
        throw new Error('获取播放地址失败');
    },

    // === 歌词 ===
    async getLyric(musicItem) {
        const res = await axios.get('https://music.163.com/api/song/lyric', { params: { id: musicItem.id, lv: -1, tv: -1 }, headers: commonHeaders });
        const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
        return { rawLrc: data.lrc?.lyric, translation: data.tlyric?.lyric };
    },

    // === 歌单分类标签 ===
    async getRecommendSheetTags() {
        const res = await axios.get('https://music.163.com/api/playlist/catalogue', { headers: commonHeaders });
        const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
        const sub = data.sub || [];
        return {
            pinned: [
                { id: 'daily_recommend', title: '每日推荐' },
                { id: 'user_created', title: '我创建的' },
                { id: 'user_collected', title: '我收藏的' }
            ],
            data: [{ title: '常用', data: [{ id: 'daily_recommend', title: '每日推荐' }, { id: 'user_created', title: '我创建的' }, { id: 'user_collected', title: '我收藏的' }] }, { title: '分类', data: sub.map(item => ({ id: item.name, title: item.name })) }]
        };
    },

    async getRecommendSheetsByTag(tag, page) {
        const cookie = (env.getUserVariables() || {}).cookie || '';
        const tagId = String(tag.id || '');
        const tagTitle = String(tag.title || '');

        if (tagId === 'daily_recommend' || tagTitle === '每日推荐') {
            if (page > 1) return { isEnd: true, data: [] };
            return { isEnd: true, data: [{ id: 'daily_recommend', title: '每日歌曲推荐', artwork: 'https://p1.music.126.net/06vU_T-7_W260uK7mX9U-A==/109951165671182690.jpg', description: '根据你的口味生成' }] };
        }

        if (tagId === 'user_created' || tagId === 'user_collected' || tagTitle === '我创建的' || tagTitle === '我收藏的') {
            if (page > 1) return { isEnd: true, data: [] };
            try {
                const accountRes = await axios.get('https://music.163.com/api/nuser/account/get', { headers: { ...commonHeaders, Cookie: cookie } });
                const accountData = typeof accountRes.data === 'string' ? JSON.parse(accountRes.data) : accountRes.data;
                const uid = accountData.account?.id || accountData.profile?.userId;
                if (!uid) return { isEnd: true, data: [] };
                
                const res = await axios.get(`https://music.163.com/api/user/playlist?uid=${uid}&limit=1000`, { headers: { ...commonHeaders, Cookie: cookie } });
                const playlistData = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
                const list = playlistData.playlist || playlistData.playlists || [];
                const isCreated = tagId === 'user_created' || tagTitle === '我创建的';
                return {
                    isEnd: true,
                    data: list.filter(p => isCreated ? (p.subscribed === false) : (p.subscribed === true)).map(p => ({ 
                        id: String(p.id), title: p.name, artist: p.creator?.nickname || '', artwork: p.coverImgUrl 
                    }))
                };
            } catch (e) {
                return { isEnd: true, data: [] };
            }
        }
        const res = await axios.get('https://music.163.com/api/playlist/list', { params: { cat: tag.title || tag.id || '全部', order: 'hot', limit: 30, offset: (page - 1) * 30 }, headers: commonHeaders });
        const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
        return { isEnd: data.more === false, data: (data.playlists || []).map(item => ({ id: String(item.id), title: item.name, artist: item.creator.nickname, artwork: item.coverImgUrl, description: item.description })) };
    },

    // === 排行榜 ===
    async getTopLists() {
        try {
            const res = await axios.get('https://music.163.com/api/toplist', { headers: commonHeaders });
            const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
            return [{
                title: '官方榜',
                data: (data.list || []).map(item => ({
                    id: String(item.id), title: item.name, artwork: item.coverImgUrl, description: item.updateFrequency
                }))
            }];
        } catch (e) { return []; }
    },

    async getTopListDetail(topListItem, page) {
        return this.getMusicSheetInfo(topListItem, page);
    },

    async getUserSheet(userId, page) {
        const cookie = (env.getUserVariables() || {}).cookie || '';
        if (page > 1) return { sheetList: [] };
        const res = await axios.get(`https://music.163.com/api/user/playlist?uid=${userId}&limit=1000`, { headers: { ...commonHeaders, Cookie: cookie } });
        const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
        return {
            sheetList: (data.playlist || []).map(p => ({
                id: String(p.id), title: p.name, artist: p.creator.nickname, artwork: p.coverImgUrl, description: p.description
            }))
        };
    }
};
