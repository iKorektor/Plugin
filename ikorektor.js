
var iKorektor = new function () {
    const apiUrl = "https://api.ikorektor.pl";
    const cssUrl = "https://cdn.jsdelivr.net/gh/ikorektor/plugin@1.0.0/css/style.min.css";
    var activeEl, txtOrig;
    var conf = {parags: 0, profanity: 0, gateway: true, location: "bottom"};
    var confEl = document.getElementById("ik-conf");

    if (confEl) {
        conf.parags = confEl.getAttribute("data-parags");
        conf.profanity = confEl.getAttribute("data-profanity");
        conf.gateway = (confEl.getAttribute("data-gateway") === "true");
        conf.location = confEl.getAttribute("data-location");
    }

    this.init = function () {
        document.body.insertAdjacentHTML("beforeend", `<button type="button" id="ik-do" title="Sprawdź błędy w tekście"><p></p></button>
<link rel="stylesheet" type="text/css" href="${cssUrl}">`);
        
        document.addEventListener("mousedown", function (e) {
            if (e.target && e.target.id === "ik-do") {
                prepareCorrect(e.target);
            }
        });
        document.addEventListener("click", function (e) {
            if (e.target) {
                if (e.target.tagName.toLowerCase() === "li" && e.target.parentNode.parentNode.classList.contains("ik-bgword")) {
                    wordCorrAction(e.target);
                } else if (e.target.id === "ik-accept") {
                    acceptCorrTxt();
                } else if (e.target.id === "ik-cancel") {
                    document.getElementById("ik-inf").style.display = "none";
                    document.getElementById("ik-do").disabled = false;
                } else if (e.target.id === "ik-legend") {
                    showCorrInfo(e.target);
                }
            }
        });
        document.addEventListener("keydown", function(e) {
            if (e.keyCode === 13 && e.target && e.target.classList.contains("ik-word-corr-origin")) { // 13 == Enter
                wordEditEnd(e);
            } else if (e.keyCode === 90 && e.ctrlKey && txtOrig) { // Ctrl+Z
                activeEl.value = txtOrig;
            }
        });
        document.addEventListener("focusin", function (e) {
            if (e.target) {
                var tag = e.target.tagName.toLowerCase();

                if (tag === "textarea" || (tag === "input" && e.target.getAttribute("type") === "text")) {
                    btnShow();
                }
            }
        });
        document.addEventListener("focusout", function(e) {
            if (e.target && e.target.classList.contains("ik-word-corr-origin")) {
                wordEditEnd(e);
            } else {
                var el = document.getElementById("ik-inf");
                
                if (!el || !(el.offsetWidth || el.offsetHeight || el.getClientRects().length)) {
                    document.getElementById("ik-do").style.display = "none";
                }
            }
        });
    };

    var btnShow = function () {
        activeEl = document.activeElement;
        
        var btnEl = document.getElementById("ik-do");
        var infEl = document.getElementById("ik-inf");
        
        btnEl.style.display = "block";
        
        var elOffset = getOffset(activeEl);
        var top = (conf.location === "top") ? elOffset.top + 5 : elOffset.top + activeEl.offsetHeight - btnEl.offsetHeight - 5;
        var right = window.innerWidth - (elOffset.left + activeEl.offsetWidth);
        
        btnEl.style.top = top.toFixed(2) + "px";
        btnEl.style.right = right.toFixed(2) + "px";
        btnEl.disabled = false;
        if (infEl) infEl.style.display = "none";
    };

    var prepareCorrect = function (btnEl) {
        var txt = getTxtareaTxt();

        if (txt.length < 3) {
            showInfo("Tekst jest zbyt krótki.", true);
            return;
        }

        btnEl.disabled = true;
        btnEl.querySelector("p").classList.add("ik-spin");
        
        ajaxCorrect(txt);
    };

    var ajaxCorrect = function (txt) {
        fetch(apiUrl, {method: "POST", body: getFormData(txt)}).then(resp => {
            if (resp.ok)
                return resp.json();
            
            throw Error(resp.statusText);
        }).then(data => {
            if (data.hasOwnProperty("error")) {
                showInfo(corrErrorTxt(data, txt.length), true);
            } else {
                txtOrig = txt;
                var p = document.createElement("p");
                p.textContent = data.text;
                data.text = p.innerHTML; // a trick to encode user's HTML tags
                showInfo(textColoring(data), false);
            }
        }).catch(err => {
            console.log(err);
            showInfo("Wystąpił nieoczekiwany błąd. Być może straciłeś połączenie z Internetem lub plugin jest niepoprawnie skonfigurowany na stronie.", true);
        });
    };
    
    var getFormData = function(txt) {
        var formData = new FormData();
        
        formData.append("key", "O");
        formData.append("text", txt);
        formData.append("app", "plugin");
        
        if (conf.parags) formData.append("parags", conf.parags);
        if (conf.profanity) formData.append("profanity", conf.profanity);
        if (!conf.gateway) formData.append("gateway", conf.gateway);
        
        return formData;
    };

    var getTxtareaTxt = function () {
        var selStart = activeEl.selectionStart, selEnd = activeEl.selectionEnd;
        return (selStart === selEnd) ? activeEl.value.trim() : activeEl.value.slice(selStart, selEnd);
    };

    var showInfo = function (inf, isErr) {
        var infEl = document.getElementById("ik-inf");
        if (!infEl) infEl = setInfoHTML();
        
        var btnEl = document.getElementById("ik-do");
        var txtEl = infEl.querySelector("div").querySelector("p");
        var btnAccEl = infEl.querySelector("#ik-accept");
        var btnOffs = getOffset(btnEl);

        btnEl.disabled = !isErr;
        btnEl.querySelector("p").classList.remove("ik-spin");
        
        infEl.style.top = (btnOffs.top + btnEl.offsetHeight + 9) + "px";
        infEl.style.right = btnEl.ownerDocument.defaultView.getComputedStyle(btnEl, null).right;
        infEl.style.display = "block";
        
        txtEl.innerHTML = inf;
        txtEl.classList.toggle("ik-corr-err", isErr);
        
        btnAccEl.disabled = isErr;
        btnAccEl.classList.toggle("ik-btn-disabled", isErr);
            
        setWordActionButtons();
    };
    
    var setInfoHTML = function() {
        document.body.insertAdjacentHTML("beforeend", `<div id="ik-inf">
<div><p></p><p><a href="https://ikorektor.pl/pluginy" target="_blank">Plugin autokorekty – iKorektor</a><span id="ik-legend">i</span></p></div>
<ul id="ik-colors"></ul>
<button type="button" id="ik-accept">Akceptuj i zamień</button>
<button type="button" id="ik-cancel">Anuluj</button>
</div>`);
        
        return document.getElementById("ik-inf");
    };

    var corrReplaceTxtarea = function (txtCorr) {
        var selStart = activeEl.selectionStart, selEnd = activeEl.selectionEnd;
        activeEl.value = (selStart === selEnd) ? txtCorr : activeEl.value.substr(0, selStart) + corrUntrim(txtCorr) + activeEl.value.substr(selEnd);
    };

    var corrUntrim = function (txtCorr) {
        return txtOrig.match(/^\s*/) + txtCorr + txtOrig.match(/\s*$/); // restore white characters from the beginning and end of the original selected text (correction has removed them)
    };

    var corrErrorTxt = function (data, txtLen) {
        switch (data.error) {
            case "TXT_LEN":
                return `Tekst jest zbyt długi (${txtLen} na ${data.txt_limit} dozwolonych znaków w jednej korekcie).`;
            case "CHARS_LMT":
                return `Możesz sprawdzić dzisiaj jeszcze ${data.chars_left} znaków, tekst ma ${txtLen} znaków.`;
            case "CALLS_LMT":
                return `Osiągnięto limit korekt na minutę. Spróbuj ponownie za chwilę.`;
            case "CALLS_LMT_SITE":
                return "Osiągnięto dobowy limit użycia pluginu.";
        }

        return "Wystąpił nieoczekiwany błąd.";
    };

    var setWordActionButtons = function () {
        [].forEach.call(document.getElementsByClassName("ik-bgword"), el => {
            if (!el.classList.contains("ik-char-succ")) {
                el.querySelector("ul").insertAdjacentHTML("beforeend", '<li class="ik-act-user ik-act-edit">[edytuj]</li><li class="ik-act-user ik-act-restore ik-hidden">[przywróć]</li>');
            }
        });
    };

    var textColoring = function (data) {
        var txt = data.text;
        var words = txt.match(/[a-zA-ZŻŹŁŚĆÓąęćłóśńżź]{2,}/g);
        var chars = txt.match(/.{4}[,.)”–?]|[(„].{4}/g);
        var suggs = [];
        var reg = null;

        if (chars) {
            for (var i = 0; i < chars.length; i++) {
                if (txtOrig.indexOf(chars[i]) === -1 && txtOrig.indexOf(unPolish(chars[i].toLowerCase())) === -1) {
                    txt = txt.replace(chars[i], chars[i].replace(/([,.()„”–?])/g, '<span class="ik-bgword ik-corr-succ ik-char-succ">$1</span>'));
                }
            }
        }

        if (data.hasOwnProperty("sugg")) {
            for (var i = 0; i < data.sugg.length; i++) {
                var sugg = data.sugg[i];
                var cnt = sugg.length - 1;
                var wrd = sugg[cnt];
                var wrdLow = wrd.toLowerCase();
                var sfx = "";

                sugg = sugg.slice(0, cnt);

                if (sugg.indexOf(wrdLow) < 0 && sugg.indexOf(wrd.substr(0, 1).toUpperCase() + wrdLow.substr(1)) < 0) {
                    sfx = "2";
                } else {
                    sugg = wordSuggsRemove(sugg, wrdLow);
                }

                txt = txt.replace(wordReg(wrd, "i"), '$1<span class="ik-bgword ik-corr-sugg' + sfx + '"><span data-word-corr-origin="$2" class="ik-word-corr-origin">$2</span><ul><li>' + sugg.reverse().join("</li><li>") + "</li></ul></span>");
                suggs.push(wrd);
            }
        }

        if (words) {
            for (var i = 0; i < words.length; i++) {
                var wrd = words[i];
                reg = wordReg(wrd);

                if (!txtOrig.match(reg)) {
                    txt = txt.replace(reg, '$1<span class="ik-bgword ik-corr-succ"><span data-word-corr-origin="$2" class="ik-word-corr-origin">$2</span><ul></ul></span>'); // &nbsp; to not match ul words

                    var regSugg = new RegExp('ik-corr-sugg(2?)(?="><span data-word-corr-origin="' + wrd + ")", "g");
                    txt = txt.replace(regSugg, "ik-corr-sugg$1-succ");
                }
            }
        }

        if (data.hasOwnProperty("succ")) {
            for (var i = 0; i < data.succ.length; i++) {
                var wrdRepl = data.succ[i][0]; // corrected word
                var wrdOrig = data.succ[i][1]; // original word

                if (suggs.indexOf(wrdOrig) >= 0) {
                    reg = new RegExp('ik-corr-sugg(?="><span data-word-corr-origin="' + wrdRepl + ")", "g");
                    txt = txt.replace(reg, "ik-corr-sugg-succ");
                } else {
                    reg = new RegExp(">" + wrdRepl + "</span><ul></ul>", "g");
                    txt = txt.replace(reg, 'data-word-origin="' + wrdOrig + '">' + wrdRepl + '</span><ul><li class="ik-act-user ik-act-revert">[cofnij]</li></ul>');
                }
            }
        }

        if (data.hasOwnProperty("fail")) {
            for (var i = 0; i < data.fail.length; i++) {
                txt = txt.replace(wordReg(data.fail[i]), '$1<span class="ik-bgword ik-corr-fail"><span data-word-corr-origin="$2" class="ik-word-corr-origin">$2</span><ul>Nierozpoznany błąd</ul></span>');
            }
        }

        return txt;
    };

    var wordReg = function (word, modifier) {
        return new RegExp("(\\s|[„(/,:;]|-|^)(" + word + ")(?=\\s|[.?!,…:;\"”()/<]|-|$)", "g" + (modifier || ""));
    };

    var wordSuggsRemove = function (suggs, word) {
        suggs.splice(suggs.indexOf(word), 1);

        if (word.indexOf("rz") > -1) {
            var index = suggs.indexOf(word.replace("rz", "z"));
            if (index > -1) suggs.splice(index, 1);
        }

        return suggs;
    };

    var wordCorrRevert = function (wordEl, liEl) {
        wordEl.textContent = wordEl.getAttribute("data-word-origin");
        wordEl.classList.add("ik-corr-revert");
        wordEl.classList.remove("ik-corr-user");
        
        liEl.style.display = "none";
        liEl.parentNode.querySelector(".ik-act-restore").classList.remove("ik-hidden");
    };

    var wordEditStart = function (wordEl) {
        var range = document.createRange();
        var sel = window.getSelection();

        wordEl.setAttribute("contenteditable", "true");
        
        range.setStart(wordEl.childNodes[0], wordEl.textContent.length);
        range.collapse(true);
        
        sel.removeAllRanges();
        sel.addRange(range);
    };

    var wordEditEnd = function(e) {
        var wordEl = e.target;
        var ulEl = wordEl.nextElementSibling;
        var word = wordEl.textContent;
        var originEqual = word === wordEl.getAttribute("data-word-origin");
        var originCorrEqual = word === wordEl.getAttribute("data-word-corr-origin");

        wordEl.setAttribute("contenteditable", "false");
        wordEl.classList.toggle("ik-corr-user", !originCorrEqual && !originEqual);
        wordEl.classList.toggle("ik-corr-revert", originEqual);

        ulEl.querySelector(".ik-act-restore").classList.toggle("ik-hidden", originCorrEqual);
        ulEl.querySelector(".ik-act-edit").classList.toggle("ik-hidden", word === ""); // word removed - it's impossible to edit it anymore, so we must to hide the edit button (only restore button will be shown)

        var revEl = ulEl.querySelector(".ik-act-revert");
        if (revEl) revEl.classList.toggle("ik-hidden", originEqual);
    };

    var wordReplaceWithSugg = function (wordEl, liEl) {
        var liWord = liEl.textContent;

        if (wordEl.textContent.match(/^[A-ZŻŹŁĆŚÓ]/)) {
            liWord = liWord.charAt(0).toUpperCase() + liWord.substr(1);
        }

        wordEl.textContent = liWord;
        wordEl.classList.toggle("ik-corr-user", liWord !== wordEl.getAttribute("data-word-corr-origin"));
        
        liEl.parentNode.querySelector(".ik-act-restore").classList.remove("ik-hidden");
    };

    var wordCorrRestore = function (wordEl, liEl) {
        var word = wordEl.getAttribute("data-word-corr-origin");
        
        wordEl.textContent = word;
        wordEl.classList.remove("ik-corr-user", "ik-corr-revert");
        
        liEl.classList.add("ik-hidden");
        liEl.parentNode.querySelector(".ik-act-edit").style.display = "block";
        
        var revEl = liEl.parentNode.querySelector(".ik-act-revert");
        if (revEl) revEl.style.display = "block";
    };

    var wordCorrAction = function (liEl) {
        var wordEl = liEl.parentNode.parentNode.querySelector(".ik-word-corr-origin");

        if (liEl.classList.contains("ik-act-revert")) {
            wordCorrRevert(wordEl, liEl);
        } else if (liEl.classList.contains("ik-act-edit")) {
            wordEditStart(wordEl);
        } else if (liEl.classList.contains("ik-act-restore")) {
            wordCorrRestore(wordEl, liEl);
        } else {
            wordReplaceWithSugg(wordEl, liEl);
        }
    };

    var acceptCorrTxt = function () {
        var txtCont = document.getElementById("ik-inf").querySelector("div").querySelector("p").innerHTML;
        var txtCorr = stripColorsHTML(txtCont); // remove iKorektor's HTML tags
        var txtCorrDec = decodeHTML(txtCorr); // decode user's HTML tags for text inputs

        corrReplaceTxtarea(txtCorrDec);
        activeEl.focus();
    };

    var unPolish = function (txt) {
        return txt.replace('ó', 'o').replace('ł', 'l').replace('ą', 'a').replace('ę', 'e').replace('ś', 's').replace('ń', 'n').replace('ć', 'c').replace('ż', 'z').replace('ź', 'z');
    };

    var stripColorsHTML = function (txt) {
        return txt.replace(/<ul>.*?<\/ul>|<\/?span.*?>/g, "");
    };

    var decodeHTML = function (str) {
        var map = {'&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#039;': "'"};
        return str.replace(/&amp;|&lt;|&gt;|&quot;|&#039;/g, m => map[m]);
    };
    
    var showCorrInfo = function(el) {
        var liEl = document.getElementById("ik-colors");
        
        if (liEl.innerHTML === "" && !el.classList.contains("ik-spin")) {
            var showResp = function(txt) {
                liEl.innerHTML = txt;
                slideToggle(liEl);
                el.classList.remove("ik-spin");
            };
            
            el.classList.add("ik-spin");
            
            fetch("https://ikorektor.pl/corr_info").then(resp => {
                if (resp.ok)
                    return resp.text();
                
                throw Error(resp.statusText);
            }).then(data => {
                showResp(data);
            }).catch(err => {
                showResp(err);
            });
        } else {
            slideToggle(liEl);
        }
    };

    var getOffset = function (el) {
        const box = el.getBoundingClientRect();

        return {
            top: box.top + window.pageYOffset - document.documentElement.clientTop,
            left: box.left + window.pageXOffset - document.documentElement.clientLeft
        };
    };

    var slideToggle = function (el) {
        el.style.transition = "max-height 1s";
        const {height} = el.ownerDocument.defaultView.getComputedStyle(el, null);
        el.style["max-height"] = (parseInt(height, 10) === 0 ? 500 : 0) + "px";
    };
};

iKorektor.init();
