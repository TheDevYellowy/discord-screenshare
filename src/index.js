const webdriver = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const ytdl = require('ytdl-core');

class Video {
    /** @private */
    async load(url, driver, youtube_dl, guildId) {
        if(this.loading[guildId]) return;
        this.loading[guildId] = true;
        driver.executeScript('video.innerHTML = null');

        if(youtube_dl) {
            try {
                let info = await ytdl.getInfo(url);
                let formats = info.formats.filter(f => f.hasVideo && f.hasAudio);
                formats = formats.filter(f => f.height <= 720 && f.fps <= 30);
                formats = formats.sort((a, b) => b.height - a.height);

                url = formats[0].url;
            } catch (e) {
                console.error(e);
            }
        }

        await driver.executeScript(`video.src='${url}'`).then(_ => {
            var int1 = setInterval(() => {
                is_error && clearInterval(int1);

                if(this.killed[guildId]) {
                    this.loading[guildId] = false;
                    this.killed[guildId] = false;
                    clearInterval(int1);
                    clearInterval(int2);
                    clearInterval(int3);
                }

                driver.getCurrentURL()
                    .then(url => {
                        if(!this.init[guildId] && url === "file:///channels/@me") {
                            this.init[guildId] = true;
                            this.open_guild();
                            this.join(this.channelId);
                            clearInterval(int1);
                        }
                        else if(this.init[guildId]) clearInterval(int1);
                    });
            }, 10);
        });

        let is_load;
        var int2 = setInterval(() => {
            driver.executeScript("return video.duration")
                .then(res => {
                    if(res) {
                        is_load = true;
                        this.duration[guildId] = res;
                        this.loading[guildId] = false
                        clearInterval(int2);
                    }
                    else if (is_error) clearInterval(int2);
                });
        }, 10);

        let is_error;
        var int3 = setInterval(() => {
            driver.executeScript('return video_error')
                .then(msg => {
                    if(msg) {
                        is_error = true;
                        this.loading[guildId] = false;
                        driver.executeScript('video_error=""');
                        clearInterval(int3);
                        return
                    }
                    else if(is_load) clearInterval(int3);
                });
        }, 10);
    }
    /**
     * Play a video to a vc
     * @param {string} guildId The id of the server you want to play the video in
     * @param {string} url the YouTube url
     */
    async play(guildId, url) {
        let driver = this.drivers[guildId];
        if(!driver) throw `No driver made for this guild, make sure you first join the vc by using the join method (module_exports/discord-screenshare/src/stream.js line 84)`;
        await this.load(url, driver, true, guildId);
        await this.start(guildId);
        driver.executeScript('video.play()');
    }
    /**
     * Pause the video in a server
     * @param {string} guildId The id of the server you want to play the video in
     */
    async pause(guildId) {
        let driver = this.drivers[guildId];
        if(!driver) throw `No driver made for this guild, I truely have no idea how you got here (module_exports/discord-screenshare/src/stream.js line 92)`;
        driver.executeScript('video.pause()');
    }
    /**
     * Either get or set the time
     * @param {?number} time the time you want to go to (+10, -3, 00:53)
     * @returns {null | number} the time or nothing
     */
    current(time = null) {
        if(time) {
            if ([ '+','-' ].includes(time[0])) {
                this.current().then(c => {
                    if (!c) return

                    let r
                    c = parseFloat(c)
                    const s = parseInt(time.slice(1))

                    time[0] === '+' ?
                        r = c + s :
                        r = c - s

                    this.driver.executeScript(`video.currentTime = ${r}`)
                });
            }
            else this.driver.executeScript(`video.currentTime = ${time}`);
        }
        else return this.driver.executeScript(`return video.currentTime`);
    }

    hms(sec) {
        if(sec) return new Date(sec * 1000).toISOString().substr(11, 8);
        return sec;
    }
}

class Stream extends Video {
    client_url = `file://${__dirname}/bin/index.html`;

    /**
     * The main class
     * @param {*} client The discord client
     * @param {boolean} headless weather or not to show the chrome windows
     */
    constructor(client, headless = true) {
        super();
        this.client = client;

        this.chromeOptions = new chrome.Options();
        headless && chromeOptions.addArguments('--headless');
        this.chromeOptions.addArguments('--no-sandbox', '--window-size=1920,1080', '--disable-web-security', '--disable-gpu', '--disable-features=NetworkService', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required', 'user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.50 Safari/537.36');

        this.drivers = {};
    }
    /**
     * @private
     */
    async open_guild(guildId) {
        let driver = this.drivers[guildId];
        if(!driver) {
            driver = this.drivers[guildId] = new webdriver.Builder().forBrowser('chrome').setChromeOptions(this.chromeOptions).build();
            driver.get(this.client_url);
            driver.executeScript(`localStorage.setItem("token", '"${this.client.token}"')`);
        }

        driver.executeScript(`document.querySelector('[data-list-item-id="guildsnav___${guildId}"]').click()`);
    }
    /**
     * @private
     */
    scroll(guildId) {
        this.drivers[guildId].executeScript(`
            var c_inject = document.getElementById('channels');
            if(c_inject.scrollTop === (c_inject.scrollHeight - c_inject.offsetHeight)) c_inject.scroll(0, 0);
            else c_inject.scroll(0, c_inject.scrolltop + 250);
        `);
    }
    /**
     * Joins a vc
     * @param {string} guildId The id of the server you want to play the video in
     * @param {string} channelId The id of the vc you want to play the video in
     */
    async join(guildId, channelId) {
        await this.open_guild(guildId);
        var intJoin = setInterval(() => {
            this.drivers[guildId].executeScript(`document.querySelector("[data-list-item-id='channels___${channelId}']").click()`)
                .then(() => {
                    clearInterval(intJoin);
                })
                .catch(() => this.scroll(guildId));
        }, 10);
    }
    /** @private */
    start(guildId) {
        this.drivers[guildId].executeScript(`
            var streamBtn = document.querySelector('[aria-label="Share Your Screen"]');
            !streamBtn.className.includes('buttonActive-3FrkXp) && streamBtn.click();
        `).catch(e => e);
    }
    /**
     * Stops the video in a certain server
     * @param {string} guildId The id of the server you want to play the video in
     */
    stop(guildId) {
        this.init[guildId] = false;
        this.drivers[guildId].get(this.client_url);
    }
    /**
     * Closes the chrome window, it is good practice to do this when leaving a vc
     * @param {string} guildId The id of the server you want to play the video in
     */
    close(guildId) {
        this.drivers[guildId].close();
    }
}

module.exports = Stream;