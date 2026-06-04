import Chart from "chart.js/auto";
const chartContainer = document.getElementById("chartContainer");
const chartCanvas = document.getElementById("statsChart");
const heroMetric = document.getElementById("heroMetric");
const articleResult = document.getElementById("articleResult");
const humanStat = document.getElementById("NotAIStat");
const mixedStat = document.getElementById("AINeutralStat");
const aiStat = document.getElementById("AIGenStat");
const AISwitch = document.getElementById("AICheck");
let chart = null;

function renderChart(humanPercent, mixedPercent, aiPercent) {
  if (humanPercent === 0 && mixedPercent === 0 && aiPercent === 0) {
    chartContainer.classList.add("hidden");
  } else {
    chartContainer.classList.remove("hidden");
  }

  const chartData = {
    labels: ["Human", "Mixed", "AI Generated"],
    datasets: [
      {
        data: [humanPercent, mixedPercent, aiPercent],
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

function showResults(data) {
  const { label, averageAIScore, humanPercent, mixedPercent, aiPercent } = data;

  renderChart(humanPercent, mixedPercent, aiPercent);

  humanStat.textContent = `${humanPercent}%`;
  mixedStat.textContent = `${mixedPercent}%`;
  aiStat.textContent = `${aiPercent}%`;
  heroMetric.textContent = `${averageAIScore}%`;
  articleResult.textContent = label;
}

// update stats automatically
chrome.storage.onChanged.addListener(function (data, name) {
  if (
    name === "local" &&
    data.articleAnalysis !== undefined &&
    data.articleAnalysis.newValue !== undefined
  ) {
    showResults(data.articleAnalysis.newValue);
  }
});

// save last stats
chrome.storage.local.get(["switchStatus", "articleAnalysis"]).then((data) => {
  if (data.switchStatus !== undefined) {
    AISwitch.checked = data.switchStatus;
  }

  if (data.articleAnalysis !== undefined) {
    showResults(data.articleAnalysis);
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
