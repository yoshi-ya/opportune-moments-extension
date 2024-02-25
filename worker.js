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
            const text = data.type === "2fa"
                ? `Recently, you were tasked to enable 2FA for ${data.domain}. Did you do it?`
                : `Recently, you were tasked to change your password for ${data.domain}. Did you do it?`;
            return surveyIntro("It's time for a super quick survey!", text)
                .then((value) => {
                    if (value !== "yes") {
                        return fetch(`${serverURL}/survey`, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                                email: request.email,
                                domain: data.domain,
                                survey: false,
                                taskType: data.type,
                            }),
                        }).then(() => {
                            return swal({
                                title: "Thank you for your time!",
                                icon: "success",
                            });
                        }).catch(() => {
                            console.log("Could not send survey to server.");
                        });
                    } else {
                        const surveyTitle = `${data.type} task for ${data.domain}`;
                        return surveyQuestion(surveyTitle, "At what time of day did you do the task?")
                            .then(
                                (value) => {
                                    survey["daytime"] = value;
                                    return surveyQuestion(surveyTitle, "From which location did you do the task?");
                                }
                            )
                            .then(
                                (value) => {
                                    survey["location"] = value;
                                    return surveyQuestion(surveyTitle, "What were you doing before engaging with the task?");
                                }
                            )
                            .then(
                                (value) => {
                                    survey["context"] = value;
                                    return surveyQuestion(surveyTitle, "Why was that a good moment to do the task?");
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
                                            email: request.email,
                                            domain: data.domain,
                                            survey: survey,
                                            taskType: data.type,
                                        }),
                                    }).then((res) => {
                                        return swal({
                                            title: "Thank you for your time!",
                                            icon: "success",
                                        });
                                    }).catch(() => {
                                        console.log("Could not send survey to server.");
                                    });
                                });
                    }
                });
        }

        const taskType = data.type;
        const instructionsRes = await fetch(`${serverURL}/instructions/${data.type}/${data.domain}`);
        const instructions = await instructionsRes.json();
        let headline = "";
        let text = "";
        if (data.type === "2fa") {
            headline = `${data.domain} offers 2FA.`;
            text = "Would you like to enable it?";
        } else if (data.type === "pw") {
            headline = "Compromised password detected!";
            text = `Your password for ${data.service} has been found in a data breach. Would you like to change it?`;
        }
        swal({
            title: headline,
            text: text,
            icon: "warning",
            buttons: {
                cancel: "No, thanks",
                ok: true,
            },
        }).then((value) => {
            if (value === "ok") {
                return swal({
                    title: "Awesome! Here's how:",
                    text: instructions.data,
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
                    email: request.email,
                    domain: data.domain,
                    taskType: taskType,
                }),
            });
        });
    }
}
);
