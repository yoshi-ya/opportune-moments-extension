const serverURL = 'https://opportune-moments-server-c68b7d59b461.herokuapp.com';

async function requestPopup(userEmail, userUrl) {
    const body = {
        email: userEmail,
        url: userUrl,
    }
    const url = `${serverURL}/popup`;

    return fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
}

const surveyQuestion = async (title, text) => {
    return swal({
        title: title,
        text: text,
        closeOnClickOutside: false,
        closeOnEsc: false,
        content: "input",
    }).then((value) => {
        if (!value) {
            return swal({text: "Please answer the question.", closeOnEsc: false, closeOnClickOutside: false}).then(() => {
                return surveyQuestion(title, text);
            });
        }
        return value;
    });
}

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
                return surveyQuestion("Question 1", "Text 1")
                    .then(
                        (value) => {
                            survey["question1"] = value;
                            return surveyQuestion("Question 2", "Text 2");
                        }
                    )
                    .then(
                        (value) => {
                            survey["question2"] = value;
                            return surveyQuestion("Question 3", "Text 3");
                        }
                    )
                    .then(
                        (value) => {
                            survey["question3"] = value;
                            fetch(`${serverURL}/survey`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                    email: request.email,
                                    domain: data.domain,
                                    survey: survey,
                                    taskType: data.type,
                                }),
                            }).then((res) => {
                                return swal({
                                    title: `${res.status}`,
                                    icon: "success",
                                });
                            }).catch(() => {
                                console.log("Could not send survey to server.");
                            });
                        }
                    );
            }

            const taskType = data.type;
            const instructionsRes = await fetch(`${serverURL}/instructions/${data.type}/${data.domain}`);
            const instructions = await instructionsRes.json();
            let headline = "";
            let text = "";
            if (data.type === "2fa") {
                headline = "This website offers 2FA.";
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
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
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
