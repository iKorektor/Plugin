function $(id) {
    return document.getElementById(id);
}

function fadeIn(el, ms) {
    el.style.opacity = 0;
    el.style.display = "block";
    let opacity = 0;

    const timer = setInterval(function() {
        opacity += 50 / (ms || 500);

        if (opacity >= 1) {
            clearInterval(timer);
            opacity = 1;
        }

        el.style.opacity = opacity;
    }, 50);
}

function num(num) {
    var n = parseInt(num);
    return n && n.toString().length > 4 ? n.toLocaleString("en-US").replace(/,/g, " ") : num;
}

function isVisible(el) {
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

function getOffset(el) {
    const box = el.getBoundingClientRect();
    return {
        top: box.top + window.pageYOffset - document.documentElement.clientTop,
        left: box.left + window.pageXOffset - document.documentElement.clientLeft
    };
}

function slide(el) {
    let height = el.offsetHeight / el.childElementCount;
    let top = parseInt(el.style.top);
    el.style.top = el.style.top === `-${el.offsetHeight - height}px` ? 0 : (isNaN(top) ? -height : top - height) + "px";
}

class TextArea {
    constructor(el) {
        this.el = el;
        let offs = getOffset(el);
        this.top = offs.top;
        this.left = offs.left;
        this.width = el.offsetWidth;
        this.height = el.offsetHeight;
        this.contEditable = el.contentEditable === "true";
    }

    getText() {
        if (this.contEditable) {
            return this.el.innerText.trim();
        } else {
            let selStart = this.el.selectionStart;
            let selEnd = this.el.selectionEnd;
            return selStart === selEnd ? this.el.value.trim() : this.el.value.slice(selStart, selEnd); // don't trim selected text – we want to restore leading and ending spaces for proper text replacement
        }
    }

    getContent() {
        return this.el[this.getProperty()];
    }
    
    replaceContent(txtCorr) {
        if (this.contEditable) {
            if (this.el.innerHTML.match(/<\/(div|p|span)>/) && !confirm("Zamiana może spowodować utratę dodatkowych danych określających np. wygląd tekstu. Czy kontynuować?")) {
                return;
            }

            this.el.innerHTML = txtCorr.replace(/\n/g, "<br>");
        } else {
            let selStart = this.el.selectionStart;
            let selEnd = this.el.selectionEnd;
            this.el.value = selStart === selEnd ? txtCorr : this.el.value.substr(0, selStart) + app.corr.restoreSpaces(txtCorr) + this.el.value.substr(selEnd);
        }
    }

    restoreContent() {
        this.el[this.getProperty()] = app.corr.txtRestore;
        app.corr.txtRestore = "";
    }

    getProperty() {
        return this.contEditable ? "innerHTML" : "value";
    }
}

class CorrectionButton {
    constructor() {
        this.el = null;
        this.conf = Object.assign({
            type: "small",
            color: "#093",
            location: "bottom", // location within textarea
            inputs: true
        }, app.conf.btn);
    }
    
    show() {
        if (!this.el) {
            this.set();
            return this.show();
        }
        
        let top = this.conf.location === "top" ? app.txtArea.top + 5 : app.txtArea.top + app.txtArea.height - 35; // stiff btn height due to CSS load delay on 1st show
        let right = window.innerWidth - (app.txtArea.left + app.txtArea.width);
        
        this.el.style.top = top.toFixed(2) + "px";
        this.el.style.right = right.toFixed(2) + "px";
        this.el.disabled = false;

        fadeIn(this.el);
    }
    
    set() {
        document.body.insertAdjacentHTML("beforeend", '<button type="button" id="ik-do"><span id="ik-do-dsc">Autokorekta</span><span id="ik-do-alert">Wykryto prawdopodobne błędy w tekście</span></button>' + app.cssLnk);
        this.el = $("ik-do");
        this.el.style.setProperty("--bgcolor", this.conf.color);
        this.el.classList.toggle("ik-do-big", this.conf.type === "big");
        this.el.addEventListener("mouseleave", () => {
            app.corrBtn.el.classList.add("ik-spin");
            setTimeout(() => app.corrBtn.el.classList.remove("ik-spin"), 500);
        });
        !!window.chrome && this.el.classList.add("ik-chrome" + (window.innerWidth < 641 ? "-mobile" : ""));
    }
    
    hide() {
        if (this.el && !this.el.disabled && isVisible(this.el)) {
            if (!app.panelEl || !isVisible(app.panelEl)) {
                this.el.style.display = "none";
                app.stopCheckTxtErr();
            }
        }
    }
}

class Correction {
    constructor() {
        this.txtOrigin = "";
        this.txtRestore = ""; // for proper restore by Ctrl+Z if txtOrigin is from selected text (which a part of whole text)
        this.txtCorrected = null;
        this.conf = Object.assign({ // defaults only; real conf are taken from storage on defaults basis
            parags: 0,
            profanity: 0, 
            gateway: true
        }, app.conf.corr);
    }
    
    static init() {
        app.corrBtn.el.disabled = true;
        app.stopCheckTxtErr();

        let txt = app.txtArea.getText().replace(/\n\n\n+/g, "\n\n");
        
        if (app.corr && app.corr.txtOrigin === txt) { // nothing has changed
            return app.showPanel(); // show panel with last information / text
        }
        
        app.corr = new Correction();
        app.corr.txtOrigin = txt;

        if (txt.trim().length < 3) {
            return app.showPanel("Tekst jest zbyt krótki.", true);
        }
       
        app.corr.callApi(txt);
    }

    callApi(txt) {
        fetch(app.apiUrl, {
            method: "POST",
            body: this.getFetchFormData(txt)
        }).then(resp => {
            if (resp.ok) return resp.json();
            throw Error(resp.statusText);
        }).then(data => {
            app.conf.prompt = false; // do not prompt if user successfully corrected at least once

            if (data.hasOwnProperty("txt_lmt")) {
                app.txtLmt = data.txt_lmt;
            }
            if (data.hasOwnProperty("chars_lmt")) {
                app.charsLmt = data.chars_lmt;
            }
            if (data.hasOwnProperty("calls_lmt")) {
                app.callsLmt = data.calls_lmt;
            }

            data.hasOwnProperty("error") ? this.onError(data) : this.onSuccess(data);
            
            if (data.hasOwnProperty("today_chars")) {
                $("ik-today-chars").textContent = num(data.today_chars);
            }
            if (data.hasOwnProperty("today_calls")) {
                $("ik-today-calls").textContent = data.today_calls;
            }
        }).catch(err => {
            console.log(err);
            this.onError({}, null);
        });
    }
    
    getFetchFormData(txt) {
        const fd = new FormData();
        
        fd.append("key", "plugin");
        fd.append("text", txt);
        fd.append("info", 1);
        
        this.conf.parags && fd.append("parags", this.conf.parags);
        this.conf.profanity && fd.append("profanity", this.conf.profanity);
        !this.conf.gateway && fd.append("gateway", 0);

        return fd;
    }
    
    onSuccess(data) {
        this.txtCorrected = new TextCorrected(data);
        this.txtCorrected.addMarks();
        app.showPanel(this.txtCorrected.txt, false);
        app.setReportTxt();
    }
    
    onError(data) {
        let txt = "";
        
        switch (data.error) {
            case "TXT_LEN":
                txt = `Tekst jest zbyt długi (${num(app.corr.txtOrigin.length)} na ${num(app.txtLmt)} dozwolonych znaków w jednej korekcie).`;
                break;
            case "CALLS_LMT_MIN":
                txt = "Osiągnięto limit korekt na minutę, spróbuj ponownie za chwilę.";
                break;
            case "CHARS_LMT_DAY":
            case "CALLS_LMT_DAY":
            case "CHARS_LMT_DAY_SITE":
            case "CALLS_LMT_DAY_SITE":
                txt = "Dzienny limit użycia pluginu został osiągnięty. Tekst możesz sprawdzić na " + app.lnk("?txt=" + encodeURIComponent(this.txtOrigin), "iKorektor.pl");
                break;
            default:
                txt = "Coś poszło nie tak. Spróbuj ponownie za chwilę lub " + app.lnk("info#errors", "dowiedz się więcej");
        }
        
        app.showPanel(txt, true);

        this.txtOrigin = ""; // prevent blocking correction attempts, the error cause may pass (e.g. temporary server problems)
    }
    
    restoreSpaces(txtCorr) {
        return this.txtOrigin.match(/^\s*/) + txtCorr + this.txtOrigin.match(/\s*$/); // restore white characters from the beginning and end of the original selected text (correction has removed them)
    }

    accept() {
        this.txtRestore = app.txtArea.getContent();

        let txtCorrHTML = $("ik-txt-corr").innerHTML; // current corrected content (user could make his own changes)
        let txtCorr = app.corr.txtCorrected.stripMarksHTML(txtCorrHTML); // remove marks HTML tags

        app.txtArea.replaceContent(Correction.decodeTags(txtCorr)); // decode user's HTML tags for text inputs
        app.txtArea.el.focus();
        app.panelEl.style.display = "none";
    }

    static isInProgress() {
        return app.corrBtn.el && app.corrBtn.el.disabled;
    }
    
    static encodeTags(txt) {
        const p = document.createElement("p");
        p.textContent = txt;
        return p.innerHTML; // a trick to encode user's HTML tags
    }
    
    static decodeTags(str) {
        const map = {'&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#039;': "'"};
        return str.replace(/&amp;|&lt;|&gt;|&quot;|&#039;/g, m => map[m]);
    }
}

class TextCorrected {    
    constructor(data) {
        this.txt = data.text;
        this.wordMarks = [];
        this.succs = data.hasOwnProperty("succs") ? data.succs : [];
        this.suggs = data.hasOwnProperty("suggs") ? data.suggs : [];
        this.fails = data.hasOwnProperty("fails") ? data.fails : [];
    }
    
    addMarks() {
        this.tokenizeSuccs(); // must be 1st - we don't want to lose correction positions from API (!)
        this.tokenizeSuggs();
        this.tokenizeFails();
        this.markTokensWithHTML();
    }
    
    tokenizeSuccs() {
        let posAdd = 0; 
        
        for (let i = 0; i < this.succs.length; i++) {
            let succ = this.succs[i];
            let token = "_" + this.wordMarks.length + "##";
            let suggs = this.findSuggs(this.suggs, succ.correction);
            let comments = succ.hasOwnProperty("comments") ? succ.comments : null;
            let wordMark = new WordMarkSucc(succ.error, comments, token, succ.correction, suggs);

            if (suggs) {
                wordMark.type += "-sugg";
            } else {
                suggs = this.findSuggs(this.fails, succ.correction);

                if (suggs) {
                    wordMark.suggs = suggs;
                    wordMark.type += "-fail";
                }
            }

            this.txt = this.txt.substr(0, succ.position + posAdd) + token + this.txt.substr(succ.position + posAdd + succ.correction.length);
            this.wordMarks.push(wordMark);
            
            posAdd += (token.length - succ.correction.length); // token affected text length; include the difference to the words position in the next loops
        }
    }
    
    tokenizeSuggs() {
        const txtCorr = this;
        
        for (let i = 0; i < this.suggs.length; i++) {
            let sugg = this.suggs[i];
            
            this.txt = this.txt.replace(this.wordReg(sugg.word, "i"), function(match) {
                let charOnLeft = match[0].toLowerCase() === sugg.word[0].toLowerCase() ? "" : match[0]; // if matched word is at the beginning of the string, there's no matched char to the left side of the word; otherwise there's always a char which we must to restore
                let wordMatch = charOnLeft === "" ? match : match.substr(1);
                let token = "_" + txtCorr.wordMarks.length + "##";
                let suggs = sugg.suggs.map(s => WordMark.markCharsDiff(sugg.word, s));
                let wordMark = new WordMark(token, wordMatch, suggs, "sugg");
                
                txtCorr.wordMarks.push(wordMark);
                
                return charOnLeft + token;
            });
        }
    }
    
    tokenizeFails() {
        const txtCorr = this;
        
        for (let i = 0; i < this.fails.length; i++) {
            let fail = this.fails[i];
            
            this.txt = this.txt.replace(this.wordReg(fail.error, "i"), function(match) {
                let charOnLeft = match[0].toLowerCase() === fail.error[0].toLowerCase() ? "" : match[0];
                let wordMatch = charOnLeft === "" ? match : match.substr(1);
                let token = "_" + txtCorr.wordMarks.length + "##";
                let suggs = fail.hasOwnProperty("suggs") ? fail.suggs.map(s => WordMark.markCharsDiff(fail.error, s)) : null;
                let wordMark = new WordMark(token, wordMatch, suggs, "fail");
                
                if (suggs) {
                    wordMark.type += "-sugg";
                }
                
                txtCorr.wordMarks.push(wordMark);
                
                return charOnLeft + token;
            });
        }
    }
    
    markTokensWithHTML() {
        this.txt = Correction.encodeTags(this.txt);

        for (let i = 0; i < this.wordMarks.length; i++) {
            let wordMark = this.wordMarks[i];
            let revBtnHTML = "", commHTML = "";
            let suggsHTML = wordMark.suggs ? `<button class="ik-mark-btn ik-sugg">${wordMark.suggs.join('</button><button class="ik-mark-btn ik-sugg">')}</button>` : "";
            
            if (wordMark instanceof WordMarkSucc) {
                if (wordMark.wordError !== null) {
                    revBtnHTML = `<button class="ik-mark-btn ik-mark-btn-rev">[cofnij korektę]</button>`;
                }
                
                commHTML = wordMark.getCommentsHTML();
            }

            this.txt = this.txt.replace(wordMark.id, `<span class="ik-mark"><span id="${wordMark.id}" class="ik-corr ik-corr-${wordMark.type}">${wordMark.wordShow}</span><span class="ik-mark-menu">${commHTML + suggsHTML + revBtnHTML + WordMark.actionBtnsHTML()}</span></span>`);
        }
    }
    
    stripMarksHTML(txt) {
        return txt.replace(/<\/?(?:span|mark).*?>|<ul>.+?<\/ul>|<button.+?<\/button>/g, ""); // not this.txt, because user can make his own changes, e.g. replace with suggestion
    }
    
    findSuggs(arrSearch, word) {
        if (arrSearch) { // simple suggs or fails with suggs
            let index = arrSearch.findIndex(el => {
                return (el.hasOwnProperty("word") ? el.word : el.error) === word.toLowerCase();
            });

            if (index > -1) {
                return arrSearch[index].hasOwnProperty("suggs") ? arrSearch[index].suggs.map(s => WordMark.markCharsDiff(word.toLowerCase(), s)) : false;
            }
        }
        
        return null;
    }
    
    findWordMark(id) {
        return this.wordMarks.find(el => {
            return el.id === id;
        });
    }

    wordReg(word, modifier) {
        return new RegExp(`(^|\\s|[.?!„'(/,:;<>=&#*_+-])(${word})(?=\\s|[.?!,…:;"”'()/<>=&#*_+-]|$)`, "g" + (modifier || "")); // not just \\W or \\b due to lack of polish characters support
    }
}

class WordMark {
    constructor(id, word, suggs, type) {
        this.id = id;
        this.wordCorr = word; // original after-correction word
        this.wordShow = word; // currently displayed word (may change due to user edit or replace with suggestion)
        this.suggs = suggs;
        this.type = type;
        this.el = null;
    }

    editStart() {
        let range = document.createRange();
        let sel = window.getSelection();

        this.el.setAttribute("contenteditable", true);
        
        range.setStart(this.el.childNodes[0], this.el.textContent.length);
        range.collapse(true);
        
        sel.removeAllRanges();
        sel.addRange(range);
    }

    editEnd() {
        let wordEdit = this.el.textContent;
        let corrEqual = (wordEdit === this.wordCorr);
        let menuEl = this.el.nextSibling;

        this.wordShow = wordEdit;
        this.el.setAttribute("contenteditable", false);
        this.el.classList.toggle("ik-corr-user", !corrEqual);
        this.suggsDisable(menuEl, wordEdit);
        this.el.blur();

        menuEl.querySelector(".ik-mark-btn-rest").disabled = corrEqual;
        menuEl.querySelector(".ik-mark-btn-edit").disabled = wordEdit === ""; // word removed - it's not possible to edit it anymore, so an edit button has to be disabled 
        
        return corrEqual;
    }

    replaceWithSugg(btnEl) {
        let suggWord = btnEl.textContent;
        let menuEl = btnEl.parentNode;

        if (this.wordCorr.match(/^[A-ZŻŹŁĆŚÓ]/)) {
            suggWord = this.wordCorr === this.wordCorr.toUpperCase() ? suggWord.toUpperCase() : suggWord[0].toUpperCase() + suggWord.substr(1);
        }

        this.wordShow = suggWord;
        this.el.textContent = suggWord;
        this.el.classList.add("ik-corr-user");
        this.suggsDisable(menuEl);
        
        btnEl.disabled = true;
        menuEl.querySelector(".ik-mark-btn-rest").disabled = false;
        menuEl.querySelector(".ik-mark-btn-edit").disabled = false; // edit button can be disabled only if user has removed a word in edition mode (then further edition is unavailable)
    }
    
    restore(btnEl) {
        var menuEl = btnEl.parentNode;
    
        this.wordShow = this.wordCorr;
        this.el.textContent = this.wordCorr;
        this.el.classList.remove("ik-corr-user");
        
        btnEl.disabled = true;
        this.suggsDisable(menuEl);
        
        menuEl.querySelector(".ik-mark-btn-edit").disabled = false; 
    }
    
    suggsDisable(menuEl, word = null) {
        [].forEach.call(menuEl.getElementsByClassName("ik-sugg"), el => {
            el.disabled = word && word.toLowerCase() === el.textContent;
        });
    }
    
    static markCharsDiff(wordOrig, wordToUL) {
        if (wordOrig && wordToUL.trim().length > 1) {
            let wordUL = "";

            for (let j = 0; j < wordToUL.length; j++) {
                let [start, length] = j > 0 ? [j - 1, 3] : [0, 2];
                let wordOrigSubstr = wordOrig.substr(start, length);

                if (wordToUL[j] !== ' ' && wordOrigSubstr.indexOf(wordToUL[j]) === -1) {
                    wordUL += `<span>${wordToUL[j]}</span>`;
                } else {
                    wordUL += wordToUL[j];
                }
            }

            return wordUL.replace(/<\/span><span>/g, "");
        }
        
        return wordToUL;
    }
    
    static action(btnEl) {
        var wordMarkEl = btnEl.parentNode.previousSibling;
        var wordMark = app.corr.txtCorrected.findWordMark(wordMarkEl.id);
        
        wordMark.el = wordMarkEl;

        if (btnEl.classList.contains("ik-mark-btn-rev")) {
            wordMark.reverse(btnEl);
        } else if (btnEl.classList.contains("ik-mark-btn-edit")) {
            wordMark.editStart();
        } else if (btnEl.classList.contains("ik-mark-btn-rest")) {
            wordMark.restore(btnEl);
        } else {
            wordMark.replaceWithSugg(btnEl);
        }
    }
    
    static actionBtnsHTML() {
        return '<button class="ik-mark-btn ik-mark-btn-rest" disabled>[przywróć]</button><button class="ik-mark-btn ik-mark-btn-edit">[edytuj]</button>';
    }
}

class WordMarkSucc extends WordMark {
    constructor(wordErr, comments, ...args) {
        super(...args);
        
        this.wordError = wordErr; // corrected word from source text
        this.wordShow = WordMark.markCharsDiff(wordErr, this.wordCorr);
        this.comments = comments;
        this.type = "succ";
    }
    
    editStart() {
        this.el.textContent = this.el.textContent.replace(/<\/?u>/g, "");
        super.editStart();
    }
    
    editEnd() {
        const corrEqual = super.editEnd();
        
        let btnRevEl = this.el.nextSibling.querySelector(".ik-mark-btn-rev");
        if (btnRevEl) btnRevEl.disabled = !corrEqual;
        
        this.el.classList.toggle("ik-corr-rev", this.wordShow === this.wordError);
        
        if (corrEqual) {
            this.wordShow = WordMark.markCharsDiff(this.wordError, this.wordCorr);
            this.el.innerHTML = this.wordShow;
        }
    }
    
    replaceWithSugg(btnEl) {
        super.replaceWithSugg(btnEl);
        
        let btnRevEl = btnEl.parentNode.querySelector(".ik-mark-btn-rev");
        if (btnRevEl) btnRevEl.disabled = true;
        this.el.classList.remove("ik-corr-rev");
    }
    
    reverse(btnEl) {
        this.el.textContent = this.wordError;
        this.el.classList.add("ik-corr-rev");
        this.el.classList.remove("ik-corr-user");
        
        btnEl.disabled = true;
        btnEl.parentNode.querySelector(".ik-mark-btn-rest").disabled = false;
        btnEl.parentNode.querySelector(".ik-mark-btn-edit").disabled = this.wordError === "";
    }
    
    restore(btnEl) {
        super.restore(btnEl);
        
        this.wordShow = WordMark.markCharsDiff(this.wordError, this.wordShow);
        this.el.innerHTML = this.wordShow;
        this.el.classList.remove("ik-corr-rev");
        
        let btnRevEl = btnEl.parentNode.querySelector(".ik-mark-btn-rev");
        if (btnRevEl) btnRevEl.disabled = false;
    }
    
    getCommentsHTML() {
        if (this.comments) {
            let [firstComm] = this.comments;
            this.comments[0] = firstComm[0].toUpperCase() + firstComm.substr(1);
            let html = `<ul><li>${this.comments.join(",</li><li>")}.</li></ul>`;
            
            return html.replace(/<li>(.+?); ?(https?.+?)(?=<|,)/g, `<li><a href="$2" target="_blank" rel="noopener" class="ik-i">ℹ</a>$1`);
        }
        
        return "";
    }
}

class App {
    constructor() {
        this.lnkUrl = "https://ikorektor.pl/";
        this.apiUrl = "https://api.ikorektor.pl";
        this.cssLnk = '<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/ikorektor/plugin@3/css/style.css">';
        this.txtLmt = 5000;
        this.charsLmt = 25000;
        this.callsLmt = 25;
        this.panelEl = null;
        this.txtArea = null; // current TextArea object
        this.corr = null; // current Correction object
        this.corrBtn = null;
        this.checkTxtErrId = null;
        this.conf = {
            btn: null,
            corr: null, 
            parags: 0, 
            profanity: 0, 
            gateway: true,
            txtbg: true,
            prompt: false,
            always: false, 
            version: null, 
            csshash: null
        };
    }
    
    init(activate) {
        if (typeof iKorektorConf === "object") {
            this.conf = Object.assign(this.conf, iKorektorConf);
        }

        if (this.conf.version && this.conf.csshash) {
            this.cssLnk = this.cssLnk.replace("@3", "@" + this.conf.version).replace(">", ` integrity="${this.conf.csshash}" crossorigin="anonymous">`);
        }

        if (activate || this.conf.always) {
            this.corrBtn = new CorrectionButton();
            this.checkActiveEl(); // for textarea autofocus
            document.addEventListener("click", this.onClick);
        }
    }
    
    onClick(e) {
        let el = e.target;
        if (!el) return;

        if (app.isTxtArea(el) && !Correction.isInProgress()) {
            app.ready(el);
        } else if (app.isTxtArea(el.parentNode) && !Correction.isInProgress()) {
            app.ready(el.parentNode);
        } else if (el.classList.contains("ik-mark-btn")) {
            WordMark.action(el);
        } else if (el.parentNode.classList.contains("ik-mark-btn")) {
            WordMark.action(el.parentNode);
        } else if (el.parentNode.id === "ik-lmt") {
            slide(el.parentNode);
        } else if (el.parentNode.parentNode.id === "ik-lmt") {
            slide(el.parentNode.parentNode);
        } else if (app.conf.prompt && el.type === "submit") {
            app.onSubmit(e);
        } else {
            switch (el.id) {
                case "ik-do":
                case "ik-do-dsc":
                    Correction.init();
                    break;
                case "ik-do-alert":
                    app.stopCheckTxtErr();
                    app.txtArea.el.focus();
                    break;
                case "ik-accept":
                    app.corr.accept();
                    break;
                case "ik-cancel":
                    app.panelEl.style.display = "none";
                    app.txtArea ? app.txtArea.el.focus() : app.corrBtn.el.style.display = "none";
                    break;
                default:
                    app.corrBtn.hide();
            }
        }
    }

    onKeyDown(e) {
        let el = e.target;
            
        if (e.keyCode === 13 && el && el.classList.contains("ik-corr")) { // enter
            app.corr.txtCorrected.findWordMark(el.id).editEnd();
        } else if (e.keyCode === 90 && e.ctrlKey && app.corr.txtRestore) { // ctrl+Z
            e.preventDefault();
            app.txtArea.restoreContent();
        }
    }

    onSubmit(e) {
        let els = document.querySelectorAll("textarea, [contenteditable]");

        if (els) {
            let txtEl = null;

            for (let el of els) {
                let txt = el.tagName.toLowerCase() === "textarea" ? el.value : el.innerText;
                if (!txtEl && txt.length > 2) {
                    txtEl = el;
                }
            }

            if (txtEl) {
                app.conf.prompt = false; // prevent further prompts on current page session
                
                if (confirm("Czy chcesz sprawdzić błędy w tekście przed wysłaniem?")) {
                    e.preventDefault();
                    txtEl.scrollIntoView({behavior: "smooth"});
                    app.ready(txtEl);
                    Correction.init();
                }
            }
        }
    }

    checkActiveEl() {
        let el = document.activeElement;
        el && this.isTxtArea(el) && this.ready(el);
    }

    startCheckTxtErr() {
        this.stopCheckTxtErr(); // hide alert if visible
        this.checkTxtErrId = setInterval(() => {
            let txt = app.txtArea.getContent();

            if (txt.match(/(^|\. )[a-zćłóśżź]/) || (txt.length > 30 && !txt.match(/[ąęćłńóśżź]/))) {
                fadeIn($("ik-do-alert"));
                this.stopCheckTxtErr(false);
            }
        }, 5000);
    }

    stopCheckTxtErr(hideAlert = true) {
        clearInterval(this.checkTxtErrId);

        if (hideAlert) {
            $("ik-do-alert").style.display = "none";
        }
    }
    
    isTxtArea(el) {
        let tag = el.tagName.toLowerCase();

        if (tag === "textarea" || el.contentEditable === "true" || (this.corrBtn.conf.inputs && tag === "input" && el.type === "text")) {
            return true;
        }
        
        return false;
    }

    ready(txtEl) {
        if (this.corr && txtEl !== this.txtArea.el) {
            this.corr.txtRestore = ""; // active text area has changed – reset ctrl+Z text
        }

        if (this.panelEl) {
            this.panelEl.style.display = "none";
        }

        this.txtArea = new TextArea(txtEl);
        this.corrBtn.show();
        this.startCheckTxtErr();
    }

    showPanel(txt, isErr) {
        if (!this.panelEl) {
            this.setPanel();
            return this.showPanel(txt, isErr);
        }

        app.corrBtn.el.disabled = false; // stop btn cog spin
        
        this.panelEl.style.top = (parseInt(app.corrBtn.el.style.top, 10) + app.corrBtn.el.offsetHeight + 10) + "px";
        this.panelEl.style.right = app.corrBtn.el.style.right;
        
        const txtCorrEl = $("ik-txt-corr");
        
        if (txt) {
            txtCorrEl.innerHTML = txt;
            txtCorrEl.classList.toggle("ik-corr-err", isErr);
            
            $("ik-accept").disabled = isErr;
            $("ik-txt-len").textContent = app.corr ? num(app.corr.txtOrigin.length) : 0;
            
            let succs = txt.match(/-succ/g);
            $("ik-corr-cnt").textContent = succs ? succs.length : 0;
        }
        
        fadeIn(this.panelEl);
    }
    
    setPanel() {        
        document.body.insertAdjacentHTML("beforeend", `<div id="ik-panel">
        <div id="ik-txt-area">
        <div id="ik-txt-corr"></div>
        <div id="ik-lmt-wnd">
        <ul id="ik-lmt">
        <li>Poprawionych błędów: <span id="ik-corr-cnt"></span></li>
        <li>Długość tekstu źródłowego: <span id="ik-txt-len"></span>/${num(this.txtLmt)}</li>
        <li>Sprawdzonych znaków dzisiaj: <span id="ik-today-chars"></span>/${num(this.charsLmt)}</li>
        <li>Wykonanych korekt dzisiaj: <span id="ik-today-calls"></span>/${this.callsLmt}</li>
        </ul>
        </div>
        <div class="ik-i">ℹ
        <ul id="ik-menu">
        <li><a href="https://ikorektor.pl/info" target="_blank" rel="noopener">Informacje o korekcie</a></li>
        <li><a href="https://ikorektor.pl/pluginy" target="_blank" rel="noopener">Informacje o wtyczce</a></li>
        <li><a href="https://ikorektor.pl/kontakt?report" target="_blank" rel="noopener" id="ik-report">Zgłoś błąd korekty</a></li>
        </ul>
        </div>
        </div>
        <button type="button" id="ik-cancel" class="ik-btn">Anuluj</button>
        <button type="button" id="ik-accept" class="ik-btn">Zamień</button>
        </div>`);
        
        $("ik-txt-area").classList.toggle("ik-txt-bg", this.conf.txtbg);
        
        this.panelEl = $("ik-panel");
        !!window.chrome && this.panelEl.classList.add("ik-chrome");

        let cls = window.innerWidth < 641 ? "ik-mobile" : !!window.chrome ? "ik-chrome" : null;
        if (cls) {
            $("ik-accept").classList.add(cls);
            $("ik-cancel").classList.add(cls);
        }
        
        document.addEventListener("keydown", app.onKeyDown);
        document.addEventListener("focusout", e => e.target && e.target.classList.contains("ik-corr") && app.corr.txtCorrected.findWordMark(e.target.id).editEnd());
    }
    
    setReportTxt() {
        const el = $("ik-report");
        el.href = el.href.replace(/report.*/, "report=" + encodeURIComponent(this.corr.txtOrigin));
    }

    lnk(uri, txt) {
        return `<a href="${this.lnkUrl + uri}" target="_blank" rel="noopener">${txt}</a>`;
    }
}

var app = new App();
app.init(document.getElementsByTagName("textarea").length || document.querySelector("input[type=text]"));