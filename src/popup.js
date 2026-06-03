import Chart from "chart.js/auto";
const chartCanvas = document.getElementById("statsChart");

const chartData = {
  labels: ["Human", "Unsure", "AI Generated"],
  datasets: [
    {
      data: [72, 18, 10],
      backgroundColor: ["#22c55e", "#facc15", "#ef4444"],
      cutout: "70%",
      borderWidth: 0,
    },
  ],
};

new Chart(chartCanvas, {
  type: "doughnut",
  data: chartData,
  options: {
    plugins: {
      legend: {
        display: false,
      },
    },
    responsive: true,
    maintainAspectRatio: false,
  },
});

//Automatically update the stats on the popup html in real time
chrome.storage.onChanged.addListener(function (data, name) {
  if (
    name === "local" &&
    data.AIDataCollected !== undefined &&
    data.AIDataCollected.newValue !== undefined
  ) {
    const stats = data.AIDataCollected.newValue;
    document.getElementById("NotAIStat").textContent = stats.NotAI ?? 0;
    document.getElementById("AINeutralStat").textContent = stats.AINeutral ?? 0;
    document.getElementById("AIGenStat").textContent = stats.AIGenerated ?? 0;
    document.getElementById("TotalImageScan").textContent =
      stats.TotalScan ?? 0;
  }
});

//Save data for the popup html for the next time if they reopen the html
chrome.storage.local.get(["switchStatus", "AIDataCollected"]).then((data) => {
  if (data.switchStatus !== undefined) {
    // Set the checkbox to the saved value
    AISwitch.checked = data.switchStatus;
  }

  //set the values to its tag content based on the saved values
  if (data.AIDataCollected !== undefined) {
    document.getElementById("NotAIStat").textContent =
      data.AIDataCollected.NotAI ?? 0;
    document.getElementById("AINeutralStat").textContent =
      data.AIDataCollected.AINeutral ?? 0;
    document.getElementById("AIGenStat").textContent =
      data.AIDataCollected.AIGenerated ?? 0;
    document.getElementById("TotalImageScan").textContent =
      data.AIDataCollected.TotalScan ?? 0;
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
            chrome.storage.local.set({ switchStatus: selectedValue });
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
