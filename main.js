async function getUserEmail() {
    const identity = await chrome.identity.getProfileUserInfo();
    return identity.email;
}


document.addEventListener('DOMContentLoaded', async function () {
    const submitButton = document.getElementById('submit-prolific-id');
    const email = await getUserEmail();

    submitButton.addEventListener('click', async function () {
        const url = `http://localhost:3000/breach/${encodeURI(email)}`;
        const res = await fetch(url);
        const resJson = await res.json();
        const accountBreached = resJson["accounts"];
        if (accountBreached) {
            const services = accountBreached.map(account => account["Name"]).join(", ");
            document.getElementById("hbip").innerHTML = `Your password has been found in a data leak for the services ${services}`;
        }
    });
});
