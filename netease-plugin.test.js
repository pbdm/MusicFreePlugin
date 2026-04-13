const neteasePlugin = require('./netease-plugin');
const axios = require('axios');

jest.mock('axios');

describe('netease-plugin 0.3.8', () => {
    beforeEach(() => {
        global.env = {
            getUserVariables: jest.fn(() => ({ cookie: 'MUSIC_U=test' }))
        };
        jest.clearAllMocks();
    });

    // --- 搜索 ---
    test('search (music) should return formatted list', async () => {
        const mockData = { result: { songs: [{ id: 1, name: 'S', ar: [{ name: 'A' }], al: { name: 'Alb' }, dt: 1000 }] } };
        axios.get.mockResolvedValue({ data: mockData });
        const result = await neteasePlugin.search('T', 1, 'music');
        expect(result.data[0].title).toBe('S');
    });

    test('search (artist) should return formatted list', async () => {
        const mockData = { result: { artists: [{ id: 1, name: 'A', picUrl: 'P' }] } };
        axios.get.mockResolvedValue({ data: mockData });
        const result = await neteasePlugin.search('T', 1, 'artist');
        expect(result.data[0].title).toBe('A');
    });

    // --- 推荐 ---
    test('getRecommendMusic should return recommendations and user playlists', async () => {
        axios.get.mockImplementation((url) => {
            if (url.includes('account/get')) return Promise.resolve({ data: { account: { id: 123 } } });
            if (url.includes('user/playlist')) return Promise.resolve({ data: { playlist: [{ id: 10, name: 'My' }] } });
            if (url.includes('api/playlist/list')) return Promise.resolve({ data: { playlists: [] } });
            return Promise.resolve({ data: {} });
        });
        const result = await neteasePlugin.getRecommendMusic();
        expect(result.find(r => r.title === '账户专属')).toBeDefined();
        expect(result.find(r => r.title === '我的歌单')).toBeDefined();
    });

    // --- 详情 ---
    test('getMusicSheetInfo (daily_recommend) should return daily songs', async () => {
        const mockDailySongs = { data: { dailySongs: [{ id: 1, name: 'D', ar: [], al: {}, dt: 1000 }] } };
        axios.post.mockResolvedValue({ data: mockDailySongs });
        const result = await neteasePlugin.getMusicSheetInfo({ id: 'daily_recommend' }, 1);
        expect(result.musicList[0].title).toBe('D');
    });

    test('getMusicSheetInfo (normal) should return tracks', async () => {
        const mockSheetDetail = { playlist: { name: 'SN', trackIds: [{ id: 101 }] } };
        const mockSongDetail = { songs: [{ id: 101, name: 'S', ar: [], al: {}, dt: 1000 }] };
        axios.get.mockImplementation((url) => {
            if (url.includes('playlist/detail')) return Promise.resolve({ data: mockSheetDetail });
            if (url.includes('song/detail')) return Promise.resolve({ data: mockSongDetail });
            return Promise.resolve({ data: {} });
        });
        const result = await neteasePlugin.getMusicSheetInfo({ id: '1' }, 1);
        expect(result.musicList[0].title).toBe('S');
    });

    test('getAlbumInfo should return album songs', async () => {
        const mockData = { album: { picUrl: 'P', description: 'D' }, songs: [{ id: 1, name: 'S', ar: [], al: {}, dt: 1000 }] };
        axios.get.mockResolvedValue({ data: mockData });
        const result = await neteasePlugin.getAlbumInfo({ id: '1' });
        expect(result.musicList[0].title).toBe('S');
    });

    // --- 评论 ---
    test('getMusicComments should return formatted comments', async () => {
        const mockData = { comments: [{ commentId: 1, content: 'C', user: { nickname: 'U' }, time: 1000, likedCount: 10 }], hasMore: false };
        axios.post.mockResolvedValue({ data: mockData });
        const result = await neteasePlugin.getMusicComments({ id: '1' }, 1);
        expect(result.data[0].content).toBe('C');
    });

    // --- 分类标签 ---
    test('getRecommendSheetTags and getRecommendSheetsByTag', async () => {
        axios.get.mockResolvedValue({ data: { sub: [{ name: 'Pop' }] } });
        const tags = await neteasePlugin.getRecommendSheetTags();
        expect(tags.pinned).toBeDefined();

        axios.get.mockImplementation((url) => {
            if (url.includes('account/get')) return Promise.resolve({ data: { profile: { userId: 123 } } });
            if (url.includes('user/playlist')) return Promise.resolve({ data: { playlist: [{ id: 10, name: 'My', creator: { userId: 123 }, subscribed: false }] } });
            return Promise.resolve({ data: {} });
        });
        const createdRes = await neteasePlugin.getRecommendSheetsByTag({ id: 'user_created' }, 1);
        expect(createdRes.data[0].title).toBe('My');
    });

    // --- 排行榜 ---
    test('getTopLists and getTopListDetail', async () => {
        axios.get.mockResolvedValue({ data: { list: [{ id: 1, name: 'Hot' }] } });
        const toplists = await neteasePlugin.getTopLists();
        expect(toplists[0].title).toBe('官方榜');

        const mockDetail = { playlist: { name: 'Hot', trackIds: [] } };
        axios.get.mockResolvedValue({ data: mockDetail });
        const detail = await neteasePlugin.getTopListDetail({ id: '1' }, 1);
        expect(detail.musicList).toBeDefined();
    });

    // --- 播放源与歌词 ---
    test('getMediaSource should return url from weapi or fallback', async () => {
        const mockMediaData = { data: [{ url: 'http://play.mp3' }] };
        axios.post.mockResolvedValue({ data: mockMediaData });
        const result = await neteasePlugin.getMediaSource({ id: '1' }, 'standard');
        expect(result.url).toBe('http://play.mp3');

        // Test fallback
        axios.post.mockResolvedValue({ data: { data: [] } });
        axios.get.mockResolvedValue({ data: { data: [{ url: 'http://fallback.mp3' }] } });
        const fallbackResult = await neteasePlugin.getMediaSource({ id: '1' }, 'standard');
        expect(fallbackResult.url).toBe('http://fallback.mp3');
    });

    test('getLyric should return lyric', async () => {
        axios.get.mockResolvedValue({ data: { lrc: { lyric: 'L' } } });
        const result = await neteasePlugin.getLyric({ id: '1' });
        expect(result.rawLrc).toBe('L');
    });

    test('getUserSheet should return list', async () => {
        axios.get.mockResolvedValue({ data: { playlist: [{ id: 1, name: 'U' }] } });
        const result = await neteasePlugin.getUserSheet(123, 1);
        expect(result.sheetList[0].title).toBe('U');
    });
});
