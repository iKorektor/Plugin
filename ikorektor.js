var iKorektor = new function() {
    const lnkUrl = "https://ikorektor.pl/";
    const apiUrl = "https://api.ikorektor.pl";
    var cssLnk = `<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/ikorektor/plugin@2/css/style.min.css">`;
    var btnEl, activeEl, txtOrig, txtOrigAll, sel, selRange, corrCnt;
    var conf = {
        type: "small", 
        location: "bottom", 
        color: "#093", 
        inputs: true, 
        txtbg: true,
        prompt: false, 
        parags: 0, 
        profanity: 0, 
        gateway: true, 
        version: null, 
        csshash: null,
        listen: false
    };

    this.init = function(listen) {
        if (typeof iKorektorConf === "object") 
            conf = Object.assign(conf, iKorektorConf);
        if (conf.version && conf.csshash) 
            cssLnk = cssLnk.replace("@2", "@" + conf.version).replace(">", ` integrity="${conf.csshash}" crossorigin="anonymous">`);
        if (listen || conf.listen)
            document.addEventListener("click", clickEv);
        
        btnEl = null, txtOrig = null;
        checkAutofocus();
    };
    
    var checkAutofocus = function() {
        var el = document.activeElement;
        if (el && isTxtArea(el)) btnShow();
    };
    
    var clickEv = function(e) {
        var el = e.target;
        if (!el) return;
        
        if (!(btnEl && btnEl.disabled) && isTxtArea(el)) {
            btnShow();
        } else if (el.tagName.toLowerCase() === "li" && el.className.indexOf("ik-") > -1 && !el.classList.contains("ik-dis")) {
            wordAction(el);
        } else if (el.parentNode.id === "ik-lmt") {
            slide(el.parentNode);
        } else if (conf.prompt && el.type === "submit") {
            submitEv(e);
        } else {
            switch (el.id) {
                case "ik-do":
                    corrInit();
                    break;
                case "ik-accept":
                    corrAccept(el.parentNode);
                    break;
                case "ik-cancel":
                    el.parentNode.style.display = "none";
                    activeEl.focus();
                    break;
                case "ik-about":
                    window.open(lnkUrl + "pluginy");
                    break;
                case "ik-report":
                    window.open(lnkUrl + "kontakt?report=" + (txtOrig ? encodeURIComponent(txtOrig) : ""));
                    break;
                case "ik-target":
                    e.preventDefault();
                    window.open(lnkUrl + "?txt=" + encodeURIComponent(activeEl.value));
                    break;
                default:
                    btnHide();
            }
        }
    };
    
    var slide = function(el) {
        var height = el.offsetHeight / el.childElementCount;
        var top = parseInt(el.style.top);
        el.style.top = el.style.top === `-${el.offsetHeight - height}px` ? 0 : (isNaN(top) ? -height : top - height) + "px";
    };
    
    var submitEv = function(e) {
        var els = document.getElementsByTagName("textarea");
        
        if (els) {
            activeEl = null;
            
            for (var i = 0; i < els.length; i++) {
                if (els[i].value.length > 2) {
                    activeEl = els[i];
                    break;
                }
            }

            if (activeEl) {
                conf.prompt = false;
                
                if (confirm("Czy chcesz wykonać autokorektę tekstu przed wysłaniem?")) {
                    e.preventDefault();
                    btnShow();
                    corrInit();
                    activeEl.scrollIntoView({behavior: "smooth"});
                }
            }
        }
    };
    
    var isTxtArea = function(el) {
        var tag = el.tagName.toLowerCase();

        if (tag === "textarea" || (conf.inputs && tag === "input" && el.type === "text") || el.contentEditable === "true") {
            if (activeEl !== el) txtOrigAll = null; // reset Ctrl+Z text, because active element has changed
            activeEl = el;
            return true;
        }
        
        return false;
    };

    var btnShow = function() {
        if (!btnEl) return btnSet();
        btnEl.style.display = "block";
        
        var elOffs = getOffset(activeEl);
        var top = (conf.location === "top") ? elOffs.top + 5 : elOffs.top + activeEl.offsetHeight - 35; // rigid btn height due to CSS load delay on 1st show
        var right = window.innerWidth - (elOffs.left + activeEl.offsetWidth);
        
        btnEl.style.top = top.toFixed(2) + "px";
        btnEl.style.right = right.toFixed(2) + "px";
        btnEl.disabled = false;
        
        var infEl = $("ik-inf");
        if (infEl) infEl.style.display = "none";
    };
    
    var btnSet = function() {
        document.body.insertAdjacentHTML("beforeend", btn("", "ik-do") + cssLnk);
        btnEl = $("ik-do");
        btnEl.classList.toggle("sml", conf.type === "small");
        btnEl.style.setProperty("background-color", conf.color);
        btnEl.style.setProperty("--bgcolor", conf.color); // for CSS background :after pseudoelement
        btnShow();
    };
    
    var btnHide = function() {
        if (btnEl && !btnEl.disabled && isVisible(btnEl)) {
            var infEl = $("ik-inf");
            if (!infEl || !isVisible(infEl)) btnEl.style.display = "none";
        }
    };

    var corrInit = function() {
        btnEl.disabled = true;
        sel = window.getSelection();
        var txt = getAreaTxt();
        
        if (txtOrig === txt) // nothing has changed
            return infShow(); // show inf element with last information / text
        
        txtOrig = txt;
        corrCnt = 0;

        if (txt.trim().length < 3)
            return infShow("Tekst jest zbyt krótki.", true);

        corrAjax();
    };

    var corrAjax = function() {
        fetch(apiUrl, {
            method: "POST",
            body: getFormData(),
            credentials: "include"
        }).then(resp => {
            if (resp.ok) return resp.json();
            throw Error(resp.statusText);
        }).then(data => {
            data.hasOwnProperty("error") ? corrErr(data) : corrSucc(data);
            
            if (data.hasOwnProperty("today_chars_used"))
                $("ik-today-chars-used").textContent = data.today_chars_used;
        }).catch(err => {
            console.log(err);
            corrErr({}, null);
        });
    };
    
    var corrSucc = function(data) {
        txtOrigAll = (activeEl.contentEditable === "true") ? activeEl.innerHTML : activeEl.value; // whole area text (useful for proper correction revert by Ctrl+Z)
        conf.prompt = false; // do not prompt if user successfully corrected at least once
                
        var p = document.createElement("p");
        p.textContent = data.text;
        data.text = p.innerHTML; // a trick to encode user's HTML tags

        infShow(corrMark(data), false);
    };
    
    var corrErr = function(data) {
        var txt = "";
        
        switch (data.error) {
            case "TXT_LEN":
                txt = `Tekst jest zbyt długi (${txtOrig.length} na ${data.txt_limit} dozwolonych znaków w jednej korekcie).`;
                break;
            case "CHARS_LMT":
                txt = `Pozostało Ci ${data.chars_left} ${wordForm(data.chars_left)} z dobowego limitu, tekst ma ${txtOrig.length} ${wordForm(txtOrig.length)}. Tekst możesz poprawić w serwisie ` + lnk("", "iKorektor.pl", "ik-target");
                break;
            case "CALLS_LMT":
                txt = "Osiągnięto limit korekt na minutę. Spróbuj ponownie za chwilę.";
                break;
            case "SITE_LMT":
                txt = "Dobowy limit użycia pluginu na stronie został osiągnięty. Tekst możesz poprawić w serwisie " + lnk("", "iKorektor.pl", "ik-target");
                break;
            default:
                txt = "Coś poszło nie tak. Spróbuj ponownie za chwilę lub " + lnk("info#errors", "dowiedz się więcej");
        }
        
        infShow(txt, true);
        txtOrig = null; // do not block correction attempts on error, the condition may change (e.g. server problems)
    };
    
    var getFormData = function() {
        var fd = new FormData();
        
        fd.append("key", "plugin");
        fd.append("text", txtOrig);
        
        if (conf.parags) fd.append("parags", conf.parags);
        if (conf.profanity) fd.append("profanity", conf.profanity);
        if (!conf.gateway) fd.append("gateway", 0);
        
        return fd;
    };

    var getAreaTxt = function() {
        var txt;
        if (activeEl.contentEditable === "true") {
            txt = getContentEditableTxt();
        } else {
            var selStart = activeEl.selectionStart, selEnd = activeEl.selectionEnd;
            txt = (selStart === selEnd) ? activeEl.value.trim() : activeEl.value.slice(selStart, selEnd);
        }
        
        return txt.replace(/\n\n\n+/g, "\n\n"); // do not trim every text - we want to restore leading and ending white spaces on selected text for proper correction accept/replace
    };
    
    var getContentEditableTxt = function() {
        if (sel.isCollapsed || sel.focusNode.parentNode !== activeEl) { // 2nd condition for text selected outside active element (text area)
            sel = null; // reset selection eventually used in element, can make a problem in further whole text correction and accept/replace
        } else {
            selRange = sel.getRangeAt(0);
            return sel.toString(); // do not trim(!)
        }

        return activeEl.innerText.trim();
    };

    var infShow = function(inf, isErr) {
        var infEl = $("ik-inf");
        if (!infEl) return infSet(inf, isErr);
        
        var txtEl = $("ik-txt");

        btnEl.disabled = false;
        
        infEl.style.top = (parseInt(btnEl.style.top, 10) + btnEl.offsetHeight + 9) + "px";
        infEl.style.right = btnEl.style.right;
        infEl.style.display = "block";
        
        if (inf) {
            txtEl.innerHTML = inf;
            txtEl.classList.toggle("ik-corr-err", isErr);
        
            $("ik-accept").disabled = isErr;
            $("ik-txt-len").textContent = txtOrig.length;
            $("ik-corr-cnt").textContent = corrCnt;
        }
        
        fadeIn(txtEl);
    };
    
    var infSet = function(inf, isErr) {
        document.body.insertAdjacentHTML("beforeend", infHTML());
        $("ik-txt-area").classList.toggle("ik-nobg", !conf.txtbg);
        corrSetListeners(); // can be unnecessary if the first action is fail/error
        infShow(inf, isErr);
    };
    
    var infHTML = function() {
        return `<div id="ik-inf"><div id="ik-txt-area"><div id="ik-txt"></div>
<div id="ik-lmt-wnd"><ul id="ik-lmt">
<li>Poprawionych błędów: <span id="ik-corr-cnt">0</span></li>
<li>Długość tekstu źródłowego: <span id="ik-txt-len">0</span></li>
<li>Sprawdzonych znaków dzisiaj: <span id="ik-today-chars-used">0</span></li>
</ul></div>${lnk("info", "ℹ", "ik-i")}</div>
${btn("Anuluj", "ik-cancel") + btn("Akceptuj i zamień", "ik-accept")}
<ul id="ik-menu"><li id="ik-about">Plugin © iKorektor</li>•<li id="ik-report">Zgłoś błąd korekty</li></ul>
</div>`;
    };
    
    var corrSetListeners = function() {
        document.addEventListener("keydown", e => {
            var el = e.target;
            
            if (e.keyCode === 13 && el && el.classList.contains("ik-corr")) { // 13 == Enter
                wordEditEnd(el);
            } else if (e.keyCode === 90 && e.ctrlKey && txtOrigAll) { // Ctrl+Z
                e.preventDefault();
                
                if (activeEl.contentEditable === "true")
                    activeEl.innerHTML = txtOrigAll;
                else
                    activeEl.value = txtOrigAll;
                
                txtOrigAll = null;
            }
        });
        
        document.addEventListener("focusout", e => {
            var el = e.target;
            if (el && el.classList.contains("ik-corr")) wordEditEnd(el);
        });
    };

    var corrMark = function(data) {
        var txt = data.text;
        var words = txt.match(/[a-zA-ZŻŹŁŚĆÓąęćłóśńżź]{2,}/g);
        var chars = txt.match(/.{4}[,.)”–?]|[(„].{4}/g);
        var suggWords = [];

        if (chars) 
            txt = corrMarkChars(txt, chars);
        if (data.hasOwnProperty("sugg")) 
            txt = corrMarkSuggs(txt, data.sugg, suggWords);
        if (words) 
            txt = corrMarkSucc1(txt, words);
        if (data.hasOwnProperty("succ")) 
            txt = corrMarkSucc2(txt, data.succ, suggWords);
        if (data.hasOwnProperty("fail")) 
            txt = corrMarkFails(txt, data.fail);

        return txt;
    };
    
    var corrMarkChars = function(txt, chars) {
        for (var i = 0; i < chars.length; i++) {
            if (txtOrig.indexOf(chars[i]) === -1 && txtOrig.indexOf(unPolish(chars[i].toLowerCase())) === -1) {
                txt = txt.replace(chars[i], chars[i].replace(/([,.()„”–?])/g, `<span class="ik-mark"><span data-corr="$1" class="ik-corr ik-corr-succ">$1</span><ul>${wordBtns()}</ul></span>`));
                corrCnt++;
            }
        }
        
        return txt;
    };
    
    var corrMarkSuggs = function(txt, suggs, suggsWrd) {
        for (var i = 0; i < suggs.length; i++) {
            var sugg = suggs[i], cnt = sugg.length - 1, wrd = sugg[cnt], wrdLow = wrd.toLowerCase(), sfx = "";
            sugg = sugg.slice(0, cnt);

            if (sugg.indexOf(wrdLow) < 0 && sugg.indexOf(wrd.substr(0, 1).toUpperCase() + wrdLow.substr(1)) < 0) {
                sfx = "2";
            } else {
                sugg = wordSuggsRemove(sugg, wrdLow);
            }

            var suggHTML = sugg.length ? `<li class="ik-sugg">${sugg.join('</li><li class="ik-sugg">')}</li>` : "";
            txt = txt.replace(wordReg(wrd, "i"), `$1<span class="ik-mark"><span data-corr="$2" class="ik-corr ik-corr-sugg${sfx}">$2</span><ul>${suggHTML + wordBtns()}</ul></span>`);
            suggsWrd[i] = wrd;
        }
        
        return txt;
    };
    
    var corrMarkSucc1 = function(txt, words) {
        for (var i = 0; i < words.length; i++) {
            var wrd = words[i], reg = wordReg(wrd);
            
            if (!txtOrig.match(reg)) {
                txt = txt.replace(reg, `$1<span class="ik-mark"><span data-corr="$2" class="ik-corr ik-corr-succ">$2</span><ul>${wordBtns()}</ul></span>`);
                txt = txt.replace(new RegExp(`ik-corr-sugg(2?)(?=">${wrd})`, "g"), "ik-corr-sugg$1-succ");
                corrCnt++;
            }
        }
        
        return txt;
    };
    
    var corrMarkSucc2 = function(txt, succs, suggWords) {
        for (var i = 0; i < succs.length; i++) {
            var wrdCorr = succs[i][0], wrdOrig = succs[i][1];
            
            if (suggWords.indexOf(wrdOrig) >= 0) {
                txt = txt.replace(new RegExp(`ik-corr-sugg(?=">${wrdCorr})`, "g"), "ik-corr-sugg-succ");
            } else {
                txt = txt.replace(new RegExp(`>${wrdCorr}</span><ul>`, "g"), ` data-orig="${wrdOrig}">${wrdCorr}</span><ul><li class="ik-act-rev">[cofnij korektę]</li>`);
            }
        }
        
        return txt;
    };
    
    var corrMarkFails = function(txt, fails) {
        for (var i = 0; i < fails.length; i++)
            txt = txt.replace(wordReg(fails[i]), `$1<span class="ik-mark"><span data-corr="$2" class="ik-corr ik-corr-fail">$2</span><ul>${wordBtns()}</ul></span>`);
        
        return txt;
    };
    
    var wordSuggsRemove = function(suggs, word) {
        suggs.splice(suggs.indexOf(word), 1);

        if (word.indexOf("rz") > -1) {
            var index = suggs.indexOf(word.replace("rz", "z"));
            if (index > -1) suggs.splice(index, 1);
        }

        return suggs;
    };

    var wordReg = function(word, modifier) {
        return new RegExp(`(\\s|[„(/,:;]|-|^)(${word})(?=\\s|[.?!,…:;\"”()/<]|-|$)`, "g" + (modifier || ""));
    };
    
    var wordBtns = function() {
        return '<li class="ik-act-edit">[edytuj]</li><li class="ik-act-rest ik-dis">[przywróć]</li>';
    };
    
    var wordAction = function(liEl) {
        var wordEl = liEl.parentNode.previousSibling;

        if (liEl.classList.contains("ik-act-rev")) {
            wordCorrRevert(wordEl, liEl);
        } else if (liEl.classList.contains("ik-act-edit")) {
            wordEditStart(wordEl);
        } else if (liEl.classList.contains("ik-act-rest")) {
            wordCorrRestore(wordEl, liEl);
        } else {
            wordReplaceWithSugg(wordEl, liEl);
        }
    };

    var wordCorrRevert = function(wordEl, liEl) {
        wordEl.textContent = wordEl.getAttribute("data-orig");
        wordEl.classList.add("ik-corr-rev");
        wordEl.classList.remove("ik-corr-user");
        
        liEl.classList.add("ik-dis");
        liEl.parentNode.querySelector(".ik-act-rest").classList.remove("ik-dis");
    };

    var wordEditStart = function(wordEl) {
        var range = document.createRange();
        var sel = window.getSelection();

        wordEl.setAttribute("contenteditable", true);
        
        range.setStart(wordEl.childNodes[0], wordEl.textContent.length);
        range.collapse(true);
        
        sel.removeAllRanges();
        sel.addRange(range);
    };

    var wordEditEnd = function(wordEl) {
        var ulEl = wordEl.nextSibling;
        var word = wordEl.textContent;
        var origEqual = (word === wordEl.getAttribute("data-orig"));
        var corrEqual = (word === wordEl.getAttribute("data-corr"));

        wordEl.setAttribute("contenteditable", false);
        wordEl.classList.toggle("ik-corr-user", !corrEqual && !origEqual);
        wordEl.classList.toggle("ik-corr-rev", origEqual);

        ulEl.querySelector(".ik-act-rest").classList.toggle("ik-dis", corrEqual);
        ulEl.querySelector(".ik-act-edit").classList.toggle("ik-dis", word === ""); // word removed - it's not possible to edit it anymore, so an edit button has to be disabled

        var revEl = ulEl.querySelector(".ik-act-rev");
        if (revEl) revEl.classList.toggle("ik-dis", !corrEqual);
        
        wordSuggsDis(ulEl, word);
        wordEl.blur();
    };

    var wordReplaceWithSugg = function(wordEl, liEl) {
        var liWord = liEl.textContent;
        var ulEl = liEl.parentNode;

        if (wordEl.textContent.match(/^[A-ZŻŹŁĆŚÓ]/)) liWord = liWord.charAt(0).toUpperCase() + liWord.substr(1);

        wordEl.textContent = liWord;
        wordEl.classList.add("ik-corr-user");
        wordEl.classList.remove("ik-corr-rev");
        
        wordSuggsDis(ulEl);
        liEl.classList.add("ik-dis");
        
        ulEl.querySelector(".ik-act-rest").classList.remove("ik-dis");
        ulEl.querySelector(".ik-act-edit").classList.remove("ik-dis"); // edit button can be disabled only if user has removed a word in edition mode (then further edition is unavailable)
        
        var revEl = ulEl.querySelector(".ik-act-rev");
        if (revEl) revEl.classList.add("ik-dis");
    };

    var wordCorrRestore = function(wordEl, liEl) {
        var word = wordEl.getAttribute("data-corr");
        var ulEl = liEl.parentNode;
        
        wordEl.textContent = word;
        wordEl.classList.remove("ik-corr-user", "ik-corr-rev");
        
        liEl.classList.add("ik-dis");
        wordSuggsDis(ulEl);
        
        ulEl.querySelector(".ik-act-edit").classList.remove("ik-dis"); 
        
        var revEl = ulEl.querySelector(".ik-act-rev");
        if (revEl) revEl.classList.remove("ik-dis");
    };
    
    var wordSuggsDis = function(ulEl, word = null) {
        [].forEach.call(ulEl.getElementsByClassName("ik-sugg"), el => {
            el.classList.toggle("ik-dis", word && word.toLowerCase() === el.textContent);
        });
    };
    
    var corrAccept = function(el) {
        var txtCorr = corrStripTags($("ik-txt").innerHTML); // remove corrMark() HTML tags
        
        corrReplaceTxtarea(decodeHTML(txtCorr)); // decode user's HTML tags for text inputs
        activeEl.focus();
        
        el.style.display = "none";
        btnEl.disabled = false;
    };
    
    var corrReplaceTxtarea = function(txtCorr) {
        if (activeEl.contentEditable === "true") {
            corrReplaceContentEditable(txtCorr);
        } else {
            var selStart = activeEl.selectionStart, selEnd = activeEl.selectionEnd;
            activeEl.value = (selStart === selEnd) 
                           ? txtCorr 
                           : activeEl.value.substr(0, selStart) + corrUntrim(txtCorr) + activeEl.value.substr(selEnd);
        }
    };
    
    var corrReplaceContentEditable = function(txtCorr) {
        if (activeEl.innerHTML.match(/<\/(div|p|span)>/) && !confirm("Zamiana spowoduje utratę dodatkowych danych określających np. wygląd tekstu. Czy kontynuować?")) {
            return false;
        }

        if (sel) { // check if contentEditable element has selection
            corrReplaceContent(txtCorr); // if so, then replace as a normal content selection
        } else {
            activeEl.innerHTML = txtCorr.replace(/\n/g, "<br>");
        }
    };
    
    var corrReplaceContent = function(txtCorr) {
        var txt = corrUntrim(txtCorr);
        var txtRows = txt.split("\n");

        selRange.deleteContents();

        for (var i = txtRows.length - 1; i >= 0; i--) {
            selRange.insertNode(document.createTextNode(txtRows[i]));
            i && selRange.insertNode(document.createElement("br"));
        }

        sel.removeAllRanges(); // remove selection, we already saved it's state in selRange
    };
    
    var corrUntrim = function(txtCorr) {
        return txtOrig.match(/^\s*/) + txtCorr + txtOrig.match(/\s*$/); // restore white characters from the beginning and end of the original selected text (correction has removed them)
    };

    var unPolish = function(txt) {
        return txt.replace('ó', 'o').replace('ł', 'l').replace('ą', 'a').replace('ę', 'e').replace('ś', 's').replace('ń', 'n').replace('ć', 'c').replace('ż', 'z').replace('ź', 'z');
    };

    var corrStripTags = function(txt) {
        return txt.replace(/<ul>.*?<\/ul>|<\/?span.*?>/g, "");
    };

    var decodeHTML = function(str) {
        var map = {'&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#039;': "'"};
        return str.replace(/&amp;|&lt;|&gt;|&quot;|&#039;/g, m => map[m]);
    };

    var btn = function(txt, id) {
        return `<button type="button" id="${id}">${txt}</button>`;
    };

    var lnk = function(uri, txt, id) {
        return `<a href="${lnkUrl + uri}" target="_blank" rel="noopener"${id ? ` id="${id}"` : ""}>${txt}</a>`;
    };

    var getOffset = function(el) {
        var box = el.getBoundingClientRect();
        return {
            top: box.top + window.pageYOffset - document.documentElement.clientTop,
            left: box.left + window.pageXOffset - document.documentElement.clientLeft
        };
    };
    
    var wordForm = function(cnt) {
        return cnt.toString().match(/(?:[^1]|^)[234]$/) ? "znaki" : "znaków";
    };
    
    var isVisible = function(el) {
        return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    };
    
    var fadeIn = function(el, ms) {
        el.style.opacity = 0;
        let opacity = 0;

        const timer = setInterval(function() {
            opacity += 50 / (ms || 500);

            if (opacity >= 1) {
                clearInterval(timer);
                opacity = 1;
            }

            el.style.opacity = opacity;
        }, 50);
    };
    
    var $ = function(id) {
        return document.getElementById(id);
    };
};

iKorektor.init(document.getElementsByTagName("textarea").length || document.querySelector("input[type=text]"));
