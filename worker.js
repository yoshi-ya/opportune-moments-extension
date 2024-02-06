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
        let headline;
        let subHeadline;
        if (data.type === "2fa") {
            headline = "This website offers 2FA.";
            subHeadline = "Would you like to enable it?";
        } else if (data.type === "pw") {
            headline = `Your password has been found in a data breach for ${data.content}`;
            subHeadline = "Would you like to change it?";
        }
        swal({
            title: headline,
            text: subHeadline,
            icon: "warning",
            buttons: {
                cancel: "remind me later",
                catch: {
                    text: "I already have 2FA enabled",
                    value: "done",
                },
            },
        })
            .then((value) => {
                if (value === "done") {
                    swal("Got it!", "You're all set.", "success");
                } else {
                    swal("Alright!", "I'll remind you later.", "info");
                }
            });
    }
});
