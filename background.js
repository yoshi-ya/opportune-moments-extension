async function getUserEmail() {
    const identity = await chrome.identity.getProfileUserInfo();
    return identity.email;
}


chrome.runtime.onInstalled.addListener(() => {
 chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs[0].url?.startsWith("chrome://")) return undefined;
    chrome.scripting.executeScript({
      target: {tabId: tabs[0].id},
      files: ['test.js']
    });
 });
});


chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (tab.url?.startsWith("chrome://")) return undefined;
    if (changeInfo.url) {
        const email = await getUserEmail();
        try {
            setTimeout(async () => {
                await chrome.tabs.sendMessage(tabId, {message: "urlChanged", url: changeInfo.url, email: email});
            }, 5000);
        } catch (error) {
            console.log(error);
        }
    }
});
