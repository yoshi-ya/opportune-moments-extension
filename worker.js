const serverURL = "https://opportune-moments-server-c68b7d59b461.herokuapp.com";

async function requestPopup(userEmail, userUrl) {
    const body = {
        email: userEmail,
        url: userUrl,
    };
    const url = `${serverURL}/popup`;

    return fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });
}

const surveyIntro = async (title, text) => {
    return swal({
        title: title,
        text: text,
        closeOnClickOutside: false,
        closeOnEsc: false,
        buttons: {
            cancel: "No, I did not.",
            yes: true,
        }
    });
};

const surveyQuestion = async (title, text) => {
    return swal({
        title: title,
        text: text,
        closeOnClickOutside: false,
        closeOnEsc: false,
        content: "input",
    }).then((value) => {
        if (!value) {
            return swal({
                text: "Please answer the question.",
                closeOnEsc: false,
                closeOnClickOutside: false
            }).then(() => {
                return surveyQuestion(title, text);
            });
        }
        return value;
    });
};

const shortSurvey = async (title, text, email, domain, taskType, survey) => {
    return surveyQuestion(title, text)
        .then(
            (value) => {
                survey["reason"] = value;
                fetch(`${serverURL}/survey`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        email,
                        domain,
                        survey,
                        taskType,
                    }),
                });
            }
        );
};

const surveySlider = async (title, text) => {
    return swal({
        title: title,
        text: text,
        closeOnClickOutside: false,
        closeOnEsc: false,
        className: "likert",
        content: {
            element: "input",
            attributes: {
                type: "range",
                min: "1",
                max: "7",
                step: "1",
                value: "4",
                id: "slider",
            },
        },
    }).then((value) => {
        if (!value || value === "") {
            return swal({
                text: "Please answer the question.",
                closeOnEsc: false,
                closeOnClickOutside: false
            }).then(() => {
                return surveySlider(title, text);
            });
        }
        return value;
    });
};

const affirmativeSurvey = async (title, email, domain, taskType, survey) => {
    return surveyQuestion(title, "From which location did you do the task?")
        .then(
            (value) => {
                survey["location"] = value;
                return surveyQuestion(title, "What were you doing before engaging with the task?");
            }
        )
        .then(
            (value) => {
                survey["context"] = value;
                return surveyQuestion(title, "Why was that a good moment to do the task?");
            }
        )
        .then(
            (value) => {
                survey["reason"] = value;
                return surveySlider(title, "How important did you consider the task?");
            }
        )
        .then(
            (value) => {
                survey["importance"] = value;
                fetch(`${serverURL}/survey`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        email,
                        domain,
                        survey,
                        taskType,
                    }),
                }).catch(() => {
                    console.log("Could not send survey to server.");
                });
            });
};

const getInstructions = async (type, domain) => {
    const res = await fetch(`${serverURL}/instructions/${type}/${domain}`);
    const data = await res.json();
    return data.data;
};

const securityTaskPopup = async (title, text, instructions, email, domain, taskType) => {
    swal({
        title,
        text,
        icon: "warning",
        closeOnClickOutside: false,
        closeOnEsc: false,
        buttons: {
            cancel: "No, thanks",
            ok: true,
        },
    }).then(async (value) => {
        let affirmative = false;
        if (value === "ok" && taskType === "pw") {
            affirmative = true;
            const url = domain.startsWith("www") ? `https://${domain}` : `https://www.${domain}`;
            window.open(url).focus();
        } else if (value === "ok") {
            affirmative = true;
            await swal({
                title: "Awesome! Here's how:",
                text: instructions,
                closeOnClickOutside: false,
                closeOnEsc: false,
                icon: "info",
            });
        }
        return affirmative;
    }).then(async (affirmative) => {
        await fetch(`${serverURL}/interaction`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                email,
                domain,
                taskType,
                affirmative,
            }),
        });
    });
};

const addEmailPopup = async (email, emails) => {
    const title = emails.length === 0 ? "Please add some email addresses." : "Add another email address?";
    const text = emails.length === 0 ? "The extension will search for data breaches where your email address has been found." : "You can add as many email addresses as you want.";
    return swal({
        title,
        text,
        content: {
            element: "input",
            attributes: {
                placeholder: "Enter an email address",
            },
        },
        closeOnClickOutside: false,
        closeOnEsc: false,
        buttons: {
            catch: {
                text: "I'm all set!",
                value: "catch",
                closeModal: true,
            },
            confirm: {
                text: "Add email",
                value: true,
            }
        },
    }).then(async (value) => {
        if (value !== "catch") {
            emails.push(value);
            return addEmailPopup(email, emails);
        }
        await fetch(`${serverURL}/email`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                email,
                emails,
            }),
        });
    });
};

chrome.runtime.onMessage.addListener(async (request, sender, _sendResponse) => {
    if (request.message === "urlChanged") {
        const res = await requestPopup(request.email, request.url);
        const data = await res.json();
        if (!data) {
            return;
        }
        const isInitial = data.initial || false;
        if (isInitial) {
            return swal({
                title: "Welcome to my study!",
                text: "This extension will occasionally suggest security tasks for you to do. It's completely up to you whether you want to do them or not. For every task, there will be a super quick survey to fill out.",
                closeOnClickOutside: false,
                closeOnEsc: false,
            }).then(() => {
                return addEmailPopup(request.email, []);
            });
        }
        const isSurvey = data.survey || false;
        if (isSurvey) {
            let survey = {
                date: new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin" }),
            };
            const affirmative = data.affirmative || false;
            const surveyTitle = data.type === "2fa"
                ? `2FA task for ${data.domain}`
                : `Compromised password task for ${data.domain}`;
            if (affirmative) {
                const text = data.type === "2fa"
                    ? `Recently, you were tasked to enable 2FA for ${data.domain}. Did you do it?`
                    : `Recently, you were tasked to change your password for ${data.domain}. Did you do it?`;
                await surveyIntro("It's time for a super quick survey!", text)
                    .then(async (value) => {
                        if (value !== "yes") {
                            const shortSurveyText = "Why did you not do the task?";
                            return await shortSurvey(surveyTitle, shortSurveyText, request.email, data.domain, data.type, survey);
                        } else {
                            return await affirmativeSurvey(surveyTitle, request.email, data.domain, data.type, survey);
                        }
                    });
            } else {
                const text = data.type === "2fa"
                    ? `Recently, you were tasked to enable 2FA for ${data.domain}. Why did you not do it?`
                    : `Recently, you were tasked to change your password for ${data.domain}. Why did you not do it?`;
                return await shortSurvey("It's time for a super quick survey!", text, request.email, data.domain, data.type, survey);
            }
        } else {
            const instructions = data.type === "2fa" ? await getInstructions(data.domain) : "";
            let headline = "";
            let text = "";
            if (data.type === "2fa") {
                headline = `${data.domain} offers 2FA.`;
                text = "Would you like to enable it?";
            } else if (data.type === "pw") {
                headline = "Compromised password detected!";
                text = `Your password for ${data.account} on ${data.domain} has been found in a data breach. Would you like to change it?`;
            }
            await securityTaskPopup(headline, text, instructions, request.email, data.domain, data.type);
        }
    }
});