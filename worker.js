// const serverURL = 'https://opportune-moments-server-c68b7d59b461.herokuapp.com';
const serverURL = 'http://localhost:3000';

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
            swal({text: "Please answer the question.", closeOnEsc: false, closeOnClickOutside: false}).then(() => {
                surveyQuestion(title, text);
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
                let feedback = {};
                return surveyQuestion("Question 1", "Text 1")
                    .then(
                        (value) => {
                            feedback["question1"] = value;
                            return surveyQuestion("Question 2", "Text 2");
                        }
                    )
                    .then(
                        (value) => {
                            feedback["question2"] = value;
                            return surveyQuestion("Question 3", "Text 3");
                        }
                    )
                    .then(
                        (value) => {
                            feedback["question3"] = value;
                            return swal({
                                title: "Thank you!",
                                text: `Question 1: ${feedback.question1}\nQuestion 2: ${feedback.question2}\nQuestion 3: ${feedback.question3}`,
                                icon: "success",
                            });
                        }
                    )
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
