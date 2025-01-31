//Automatically update the stats on the popup html in real time
chrome.storage.onChanged.addListener(function(data, name){
  if (name === "local" && data.AIDataCollected !== undefined){
    document.getElementById("NotAIStat").textContent = data.AIDataCollected.newValue.NotAI;
    document.getElementById("AINeutralStat").textContent = data.AIDataCollected.newValue.AINeutral;
    document.getElementById("AIGenStat").textContent = data.AIDataCollected.newValue.AIGenerated;
    document.getElementById("TotalImageScan").textContent = data.AIDataCollected.newValue.TotalScan;
  }
});

//Save data for the popup html for the next time if they reopen the html
chrome.storage.local.get(["switchStatus", "AIDataCollected"]).then((data) => {
  if (data.switchStatus !== undefined) {
    // Set the checkbox to the saved value
    AISwitch.checked = data.switchStatus;
  }

  //set the values to its tag content based on the saved values
  if (data.switchStatus !== undefined){
    document.getElementById("NotAIStat").textContent = data.AIDataCollected.NotAI;
    document.getElementById("AINeutralStat").textContent = data.AIDataCollected.AINeutral;
    document.getElementById("AIGenStat").textContent = data.AIDataCollected.AIGenerated;
    document.getElementById("TotalImageScan").textContent = data.AIDataCollected.TotalScan;
  }
});

const AISwitch = document.getElementById("AICheck");

AISwitch.addEventListener("change", function () {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs.length > 0) {
      // Ensure we have a valid tab
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id }, // Access tabId properly
        function: async (selectedValue) => {
          try {
            chrome.storage.local.set({ switchStatus: selectedValue })
          } catch (e) {
            console.log(e);
          }
        },
        args: [AISwitch.checked], // Pass the checkbox boolean
      });
    } else {
      console.error("No active tab");
    }
  });
});
