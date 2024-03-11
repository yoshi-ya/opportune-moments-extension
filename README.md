# Security Alerts - a Chrome Extension

This Chrome Extension is part of my master thesis on _Opportune Moments for Security Tasks_. It's designed to provide
security enhancing suggestions to the user. You will be asked to complete a short survey after every interaction.

## Prerequisites

- Google Chrome Browser

## Installation

1. Clone or download the repository
2. Open Chrome browser
3. Navigate to `chrome://extensions/` or click on the three dots in the top right corner and
   select `More tools` -> `Extensions`
4. Enable `Developer mode` in the top right corner
5. Click on `Load unpacked` and select the cloned repository
6. The extension should now be installed and ready to use
7. You can pin the extension to the browser toolbar by clicking on the puzzle piece in the top right corner and then
   clicking on the pin icon next to the extension
8. Enable [Google SYNC](https://support.google.com/chrome/answer/185277?co=GENIE.Platform%3DDesktop&hl=en-GB) in the Chrome browser
9. Make sure your search engine is either Google or DuckDuckGo

## Usage and Study

For this part of the study, you simply have to use the browser as you normally would. The extension will occasionally provide you
with security alerts. You will be asked to complete a short survey after every interaction. We would
highly appreciate it, if you could keep the extension enabled during the whole study duration. You can see whether the study is
still running by clicking on the extension icon in the browser toolbar. After the study is finished, you can remove the
extension and delete the repository.

## Privacy Policy

### Data Collection

The extension will collect the following private information:

- your email addresses
- domains of some visited websites
  - these domains will either be services that offer 2FA or services that have been breached in the past
  - we will not store your browsing history

### Data Encryption

We take the security of your data seriously and have implemented measures to protect your personal information from
unauthorized access, use, or disclosure. The information you provide is transmitted through a secure communication
network and is encrypted using industry-standard encryption protocols.

### Data Storage

We store your encrypted personal information on secure servers that use a variety of security technologies and
procedures to help protect your personal information. We use [MongoDB Atlas](https://www.mongodb.com/de-de/atlas) for cloud storage and [Heroku](https://dashboard.heroku.com/) for cloud computing. 
After the study is finished, we will delete all your personal information from our servers.

### Data Usage

At no point will we share your personal information with third parties. Your personal information will only be used to
improve the extension and to provide better insights into the user's security behavior. We are not interested in your
personal browsing behavior and will not track your browsing history.

We use your Google profile email address to create a unique identifier for the study. This identifier will be used to
associate your survey responses with your browsing behavior. Every email address you further provide will be used to
search for breaches in the [Have I Been Pwned](https://haveibeenpwned.com/) database.
