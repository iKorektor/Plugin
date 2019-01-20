var iKorektor = new function() {
    const lnkUrl = "https://ikorektor.pl/";
    const apiUrl = "https://api.ikorektor.pl";
    const cssUrl = "https://cdn.jsdelivr.net/gh/ikorektor/plugin@2.0.0/css/style.min.css";
    const cssLnk = `<link rel="stylesheet" href="${cssUrl}" integrity="sha384-G3dOApykiTPL7aLeEbzVHXwUSk1JTWV52G674xzrN19aPDVo7YHmxRvZfI1+n9RG" crossorigin="anonymous">`;
    
    var activeEl, txtOrig, txtOrigAll, conf = {location: "bottom", inputs: true, prompt: false, parags: 0, profanity: 0, gateway: true};

    this.init = function(listen) {
        if (typeof iKorektorConf === "object") conf = Object.assign(conf, iKorektorConf);
        if (listen) document.addEventListener("click", clickEv);
    };
    
    var clickEv = function(e) {
        var el = e.target;
        if (!el) return;
        
        var tag = el.tagName.toLowerCase();

        if (tag === "textarea" || (conf.inputs && tag === "input" && el.type === "text")) {
            if (activeEl !== el) txtOrigAll = null; // reset Ctrl+Z functionality if active element changed
            activeEl = el;
            btnShow();    
        } else if (tag === "li") {
            if (el.className.indexOf("ik-") >= 0 && !el.classList.contains("ik-dis")) wordAction(el);
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
                    document.getElementById("ik-do").disabled = false;
                    activeEl.focus();
                    break;
                case "ik-report":
                    e.preventDefault();
                    window.open(el.href + (txtOrig ? "=" + encodeURIComponent(txtOrig) : ""));
                    break;
                default:
                    btnHide();
            }
        }
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

    var btnShow = function() {
        var btnEl = document.getElementById("ik-do");
        
        if (!btnEl) {
            document.body.insertAdjacentHTML("beforeend", btn("", "ik-do") + cssLnk);
            return setTimeout(btnShow, 500); // wait until CSS file is loaded and show the button properly
        }
        
        btnEl.style.display = "block";
        
        var elOffs = getOffset(activeEl);
        var top = (conf.location === "top") ? elOffs.top + 5 : elOffs.top + activeEl.offsetHeight - btnEl.offsetHeight - 5;
        var right = window.innerWidth - (elOffs.left + activeEl.offsetWidth);
        
        btnEl.style.top = top.toFixed(2) + "px";
        btnEl.style.right = right.toFixed(2) + "px";
        btnEl.disabled = false;
        
        var infEl = document.getElementById("ik-inf");
        if (infEl) infEl.style.display = "none";
    };
    
    var btnHide = function() {
        var btnEl = document.getElementById("ik-do");
        
        if (btnEl && isVisible(btnEl)) {
            var infEl = document.getElementById("ik-inf");
            var condDesktop = window.innerWidth > 720 && (!infEl || !isVisible(infEl));
            var condMobile = window.innerWidth < 721 && !isVisible(activeEl);
            
            if (condDesktop || condMobile) btnEl.style.display = "none";
        }
    };

    var corrInit = function() {
        var txt = getTxtareaTxt();
        if (txt.length < 3) return infShow("Tekst jest zbyt krótki.", true);

        var btnEl = document.getElementById("ik-do");
        btnEl.disabled = true;
        btnEl.classList.add("ik-spin");
        
        corrAjax(txt);
    };

    var corrAjax = function(txt) {
        fetch(apiUrl, {method: "POST", body: getFormData(txt), credentials: "include"}).then(resp => {
            if (resp.ok) return resp.json();
            throw Error(resp.statusText);
        }).then(data => {
            if (data.hasOwnProperty("error")) {
                infShow(corrErrorTxt(data, txt.length), true);
            } else {
                txtOrig = txt; // original source of corrected text (can be a part of area text due to selection)
                txtOrigAll = activeEl.value; // whole area text (useful for proper correction revert by Ctrl+Z)
                conf.prompt = false; // do not prompt is user successfully corrected at least once
                
                var p = document.createElement("p");
                p.textContent = data.text;
                data.text = p.innerHTML; // a trick to encode user's HTML tags
                
                infShow(corrMark(data), false);
            }
        }).catch(err => {
            console.log(err);
            infShow(corrErrorTxt({}, null), true);
        });
    };
    
    var getFormData = function(txt) {
        var fd = new FormData();
        
        fd.append("key", "O");
        fd.append("text", txt);
        fd.append("app", "plugin");
        
        if (conf.parags) fd.append("parags", conf.parags);
        if (conf.profanity) fd.append("profanity", conf.profanity);
        if (!conf.gateway) fd.append("gateway", 0);
        
        return fd;
    };

    var getTxtareaTxt = function() {
        var selStart = activeEl.selectionStart, selEnd = activeEl.selectionEnd;
        return (selStart === selEnd) ? activeEl.value.trim() : activeEl.value.slice(selStart, selEnd);
    };

    var infShow = function(inf, isErr) {
        var infEl = document.getElementById("ik-inf");
        
        if (!infEl) {
            document.body.insertAdjacentHTML("beforeend", `<div id="ik-inf"><div></div>${btn("Anuluj", "ik-cancel") + btn("Akceptuj i zamień", "ik-accept")}
<p>${lnk("pluginy", "Plugin autokorekty © iKorektor")+"•"+lnk("info", "Informacje")+"•"+lnk("kontakt?report", "Zgłoś błąd korekty", "ik-report")}</p></div>`);
            corrSetListeners(); // can be unnecessary if the first action is fail/error
            return infShow(inf, isErr);
        }
        
        var btnEl = document.getElementById("ik-do");
        var txtEl = infEl.querySelector("div");

        btnEl.disabled = !isErr;
        btnEl.classList.remove("ik-spin");
        
        infEl.style.top = (parseInt(btnEl.style.top, 10) + btnEl.offsetHeight + 9) + "px";
        infEl.style.right = btnEl.style.right;
        infEl.style.display = "block";
        
        txtEl.innerHTML = inf;
        txtEl.classList.toggle("ik-corr-err", isErr);
        
        infEl.querySelector("#ik-accept").disabled = isErr;
    };
    
    var corrSetListeners = function() {
        document.addEventListener("keydown", e => {
            var el = e.target;
            
            if (e.keyCode === 13 && el && el.classList.contains("ik-corr")) { // 13 == Enter
                wordEditEnd(el);
            } else if (e.keyCode === 90 && e.ctrlKey && txtOrigAll) { // Ctrl+Z
                activeEl.value = txtOrigAll;
                txtOrigAll = null;
            }
        });
        
        document.addEventListener("focusout", e => {
            var el = e.target;
            if (el && el.classList.contains("ik-corr")) wordEditEnd(el);
        });
    };

    var corrErrorTxt = function(data, txtLen) {
        switch (data.error) {
            case "TXT_LEN":
                return `Tekst jest zbyt długi (${txtLen} na ${data.txt_limit} dozwolonych znaków w jednej korekcie).`;
            case "CHARS_LMT":
                return `Pozostało Ci ${data.chars_left} znaków z dobowego limitu, tekst ma ${txtLen} znaków.`;
            case "CALLS_LMT":
                return "Osiągnięto limit korekt na minutę. Spróbuj ponownie za chwilę.";
            case "SITE_LMT":
                return "Dobowy limit użycia pluginu został osiągnięty. Tekst możesz poprawić na stronie " + lnk("", "iKorektor.pl");
        }

        return "Coś poszło nie tak. Spróbuj ponownie za chwilę lub " + lnk("info", "dowiedz się więcej");
    };

    var corrMark = function(data) {
        var txt = data.text;
        var words = txt.match(/[a-zA-ZŻŹŁŚĆÓąęćłóśńżź]{2,}/g);
        var chars = txt.match(/.{4}[,.)”–?]|[(„].{4}/g);
        var suggWords = [];

        if (chars) txt = corrMarkChars(txt, chars);
        if (data.hasOwnProperty("sugg")) txt = corrMarkSuggs(txt, data.sugg, suggWords);
        if (words) txt = corrMarkSucc1(txt, words);
        if (data.hasOwnProperty("succ")) txt = corrMarkSucc2(txt, data.succ, suggWords);
        if (data.hasOwnProperty("fail")) txt = corrMarkFails(txt, data.fail);

        return txt;
    };
    
    var corrMarkChars = function(txt, chars) {
        for (var i = 0; i < chars.length; i++)
            if (txtOrig.indexOf(chars[i]) === -1 && txtOrig.indexOf(unPolish(chars[i].toLowerCase())) === -1)
                txt = txt.replace(chars[i], chars[i].replace(/([,.()„”–?])/g, `<span class="ik-mark"><span data-corr="$1" class="ik-corr ik-corr-succ">$1</span><ul>${wordBtns()}</ul></span>`));
        
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
        var txtCorr = stripColorsHTML(el.querySelector("div").innerHTML); // remove iKorektor's HTML tags
        corrReplaceTxtarea(decodeHTML(txtCorr)); // decode user's HTML tags for text inputs
        
        el.style.display = "none";
        document.getElementById("ik-do").disabled = false;
        
        activeEl.focus();
    };
    
    var corrReplaceTxtarea = function(txtCorr) {
        var selStart = activeEl.selectionStart, selEnd = activeEl.selectionEnd;
        activeEl.value = (selStart === selEnd) ? txtCorr : activeEl.value.substr(0, selStart) + txtOrig.match(/^\s*/) + txtCorr + txtOrig.match(/\s*$/) + activeEl.value.substr(selEnd);
    };

    var unPolish = function(txt) {
        return txt.replace('ó', 'o').replace('ł', 'l').replace('ą', 'a').replace('ę', 'e').replace('ś', 's').replace('ń', 'n').replace('ć', 'c').replace('ż', 'z').replace('ź', 'z');
    };

    var stripColorsHTML = function(txt) {
        return txt.replace(/<ul>.*?<\/ul>|<\/?span.*?>/g, "");
    };

    var decodeHTML = function(str) {
        var map = {'&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#039;': "'"};
        return str.replace(/&amp;|&lt;|&gt;|&quot;|&#039;/g, m => map[m]);
    };

    var btn = function(txt, id) {
        return `<button type="button" id="${id}">${txt}</button>`;
    };

    var lnk = function(uri, txt, id = null) {
        return `<a href="${lnkUrl + uri}" target="_blank" rel="noopener"${id ? ' id="' + id + '"' : ""}>${txt}</a>`;
    };

    var getOffset = function(el) {
        var box = el.getBoundingClientRect();
        return {
            top: box.top + window.pageYOffset - document.documentElement.clientTop,
            left: box.left + window.pageXOffset - document.documentElement.clientLeft
        };
    };
    
    var isVisible = function(el) {
        return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    };
};

iKorektor.init(document.getElementsByTagName("textarea").length || document.querySelector("input[type=text]"));
