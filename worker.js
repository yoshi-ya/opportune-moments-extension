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

const nonAffirmativeSurvey = async (title, email, domain, taskType, survey) => {
    return surveyQuestion(title, "Why did you not do the task?")
        .then(
            (value) => {
                survey["reason"] = value;
                return fetch(`${serverURL}/survey`, {
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
        ).then(() => {
            return swal({
                title: "Thank you for your time!",
                icon: "success",
            });
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
                }).then(() => {
                    return swal({
                        title: "Thank you for your time!",
                        icon: "success",
                    });
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
    return swal({
        title,
        text,
        icon: "warning",
        closeOnClickOutside: false,
        closeOnEsc: false,
        buttons: {
            cancel: "No, thanks",
            ok: true,
        },
    }).then((value) => {
        if (value === "ok") {
            return swal({
                title: "Awesome! Here's how:",
                text: instructions,
                closeOnClickOutside: false,
                closeOnEsc: false,
                icon: "info",
            });
        }
    }).then(async () => {
        await fetch(`${serverURL}/interaction`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                email,
                domain,
                taskType,
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
        const isSurvey = data.survey || false;
        if (isSurvey) {
            let survey = {
                date: new Date()
            };
            const surveyTitle = data.type === "2fa"
                ? `2FA task for ${data.domain}`
                : `Compromised password task for ${data.domain}`;
            const text = data.type === "2fa"
                ? `Recently, you were tasked to enable 2FA for ${data.domain}. Did you do it?`
                : `Recently, you were tasked to change your password for ${data.domain}. Did you do it?`;
            await surveyIntro("It's time for a super quick survey!", text)
                .then(async (value) => {
                    if (value !== "yes") {
                        return await nonAffirmativeSurvey(surveyTitle, request.email, data.domain, data.type, survey);
                    } else {
                        return await affirmativeSurvey(surveyTitle, request.email, data.domain, data.type, survey);
                    }
                });
        } else {
            const instructions = await getInstructions(data.type, data.domain);
            let headline = "";
            let text = "";
            if (data.type === "2fa") {
                headline = `${data.domain} offers 2FA.`;
                text = "Would you like to enable it?";
            } else if (data.type === "pw") {
                headline = "Compromised password detected!";
                text = `Your password for ${data.domain} has been found in a data breach. Would you like to change it?`;
            }
            await securityTaskPopup(headline, text, instructions, request.email, data.domain, data.type);
        }
    }
});