async function sendData(userEmail, userUrl) {
    const body = {
        email: userEmail,
        url: userUrl,
    }
    const url = 'http://localhost:3000/user';

    return fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
}

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.message === "urlChanged") {
        const res = await sendData(request.email, request.url);
        const data = await res.json();
        let headline = "";
        let subHeadline = "";
        if (data.type === "2fa") {
            headline = "This website offers 2FA.";
            subHeadline = "Would you like to enable it?";
            swal({
            title: headline,
            text: subHeadline,
            icon: "warning",
            buttons: {
                cancel: "No, thanks",
                ok: true,
            },
        })
            .then((value) => {
                if (value === "ok") {
                    const instruction = "OpenAI instructions...";
                    return swal("Perfect! Here's an instruction:", instruction, "info");
                }
            })
            .then(() => {
                swal("Survey! ", "Please tell us more about this moment...");
            });
        } else if (data.type === "pw") {
            headline = "Compromised password detected!";
            subHeadline = `Your password for ${data.service} has been found in a data breach`;
            swal({
            title: headline,
            subTitle: subHeadline,
            text: "Would you like to change it?",
            icon: "warning",
            buttons: {
                cancel: "No, thanks",
                ok: true,
            },
        })
            .then((value) => {
                if (value === "ok") {
                    const instruction = "OpenAI instructions...";
                    return swal("Perfect! Here's an instruction:", instruction, "info");
                }
            })
            .then(() => {
                swal("Survey! ", "Please tell us more about this moment...");
            });
        }
    }
});
