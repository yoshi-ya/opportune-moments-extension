async function taskRequest(userEmail, userUrl) {
    const body = {
        email: userEmail,
        url: userUrl,
    }
    const url = 'http://localhost:3000/task';

    return fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
}


chrome.runtime.onMessage.addListener(async (request, sender, _sendResponse) => {
    if (request.message === "urlChanged") {
        const res = await taskRequest(request.email, request.url);
        const data = await res.json();
        const taskType = data.type;
        if (!data) {
            return;
        }
        const instructionsRes = await fetch(`http://localhost:3000/instructions/${data.type}/${data.domain}`);
        const instructions = await instructionsRes.json();
        let headline = "";
        let text = "";
        let affirmative = false;
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
                affirmative = true;
                return swal({
                    title: "Awesome! Here's how:",
                    text: instructions.data,
                    icon: "info",
                });
            }
        }).then(() => {
            if (affirmative) {
                return swal("Why is this a good moment?", "Please describe", {
                    content: "input",
                });
            }
            return swal("Why is this an inappropriate moment?", "Please explain", {
                content: "input",
            });
        }).then(async (feedback) => {
            await fetch('http://localhost:3000/feedback', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: request.email,
                    domain: data.domain,
                    affirmative: affirmative,
                    feedback: feedback,
                    taskType: taskType,
                }),
            });
            // todo: improve domain storage
            //  don't ask for every google service
            //  if popup did not show, ask again later (=> don't store URL in db)
            //  improve feedback alert text - maybe a single alert is sufficient
            //   -> Did you do the task? (yes/no) && Why? (input)
            //  encode and decode URLs everywhere
            //  write README
        });
    }
});
