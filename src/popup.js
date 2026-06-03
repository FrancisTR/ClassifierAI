import Chart from "chart.js/auto";
const chartContainer = document.getElementById("chartContainer");
const chartCanvas = document.getElementById("statsChart");
const heroMetric = document.getElementById("heroMetric");
const articleResult = document.getElementById("articleResult");
const humanStat = document.getElementById("NotAIStat");
const unsureStat = document.getElementById("AINeutralStat");
const aiStat = document.getElementById("AIGenStat");
const AISwitch = document.getElementById("AICheck");
let chart = null;

function renderChart(humanPercent, unsurePercent, aiPercent) {
  const chartData = {
    labels: ["Human", "Unsure", "AI Generated"],
    datasets: [
      {
        data: [humanPercent, unsurePercent, aiPercent],
        backgroundColor: ["#22c55e", "#facc15", "#ef4444"],
        cutout: "70%",
        borderWidth: 0,
      },
    ],
  };

  if (chart) {
    chart.destroy();
  }

  chart = new Chart(chartCanvas, {
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
}

// update stats automatically
chrome.storage.onChanged.addListener(function (data, name) {
  if (
    name === "local" &&
    data.articleAnalysis !== undefined &&
    data.articleAnalysis.newValue !== undefined
  ) {
    const { aiScore, confidence, label } = data.articleAnalysis.newValue;

    chartContainer.classList.remove("hidden");

    renderChart(confidence, 0, aiScore);

    humanStat.textContent = `${confidence ?? 0}%`;
    unsureStat.textContent = `0%`;
    aiStat.textContent = `${aiScore ?? 0}%`;
    heroMetric.textContent = `${confidence ?? 0}%`;
    articleResult.textContent = `${label}`;
  }
});

// save last stats
chrome.storage.local.get(["switchStatus", "articleAnalysis"]).then((data) => {
  if (data.switchStatus !== undefined) {
    // Set the checkbox to the saved value
    AISwitch.checked = data.switchStatus;
  }

  if (data.articleAnalysis !== undefined) {
    const { aiScore, confidence, label } = data.articleAnalysis;

    chartContainer.classList.remove("hidden");

    renderChart(confidence, 0, aiScore);

    humanStat.textContent = `${confidence ?? 0}%`;
    unsureStat.textContent = `0%`;
    aiStat.textContent = `${aiScore ?? 0}%`;
    heroMetric.textContent = `${confidence ?? 0}%`;
    articleResult.textContent = `${label}`;
  }
});

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
