const neteasePlugin = require('./netease-plugin');
const axios = require('axios');

jest.mock('axios');

describe('netease-plugin 0.3.6', () => {
    beforeEach(() => {
        global.env = {
            getUserVariables: jest.fn(() => ({ cookie: 'MUSIC_U=test' }))
        };
        jest.clearAllMocks();
    });

    test('search should return songs', async () => {
        const mockData = { result: { songs: [{ id: 1, name: 'S', ar: [{ name: 'A' }], al: { name: 'Alb' }, dt: 1000 }] } };
        axios.get.mockResolvedValue({ data: mockData });
        const result = await neteasePlugin.search('T', 1, 'music');
        expect(result.data[0].title).toBe('S');
    });

    test('getRecommendMusic should return daily recommend and user playlists', async () => {
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

    test('getTopLists should return official lists', async () => {
        axios.get.mockResolvedValue({ data: { list: [{ id: 1, name: 'Hot' }] } });
        const result = await neteasePlugin.getTopLists();
        expect(result[0].title).toBe('官方榜');
        expect(result[0].data[0].title).toBe('Hot');
    });

    test('getMediaSource should call postWeapi correctly', async () => {
        const mockMediaData = { data: [{ url: 'http://play.mp3' }] };
        axios.post.mockResolvedValue({ data: mockMediaData });
        const result = await neteasePlugin.getMediaSource({ id: '1' }, 'standard');
        expect(result.url).toBe('http://play.mp3');
    });
});
