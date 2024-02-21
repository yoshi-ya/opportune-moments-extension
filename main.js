document.addEventListener('DOMContentLoaded', async () => {
    const res = await fetch("https://opportune-moments-server-c68b7d59b461.herokuapp.com/");
    const status = res.status;
    const headline = document.getElementById("status");
    if (status === 200) {
        headline.innerText = "The extension is up and running!";
    } else {
        headline.innerText = "Thank you for your participation! The survey phase ended, you can now remove the extension.";
    }
});
