async function getUserEmail() {
    try {
        const identity = await chrome.identity.getProfileUserInfo();
        return identity.email;
    } catch (error) {
        return undefined;
    }
}


chrome.runtime.onInstalled.addListener(() => {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs[0].url?.startsWith("chrome://")) return undefined;
        chrome.scripting.executeScript({
            target: {tabId: tabs[0].id},
            files: ['worker.js']
        });
    });
});


chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (tab.url?.startsWith("chrome://")) return undefined;
    if (changeInfo.url) {
        const email = await getUserEmail();

        if (!email) return;

        try {
            setTimeout(async () => {
                await chrome.tabs.sendMessage(tabId, {
                    message: "urlChanged", url: changeInfo.url, email: email
                });
            }, 5000);
        } catch (error) {
            console.log(error);
        }
    }
});
