import Chart from "chart.js/auto";
const chartContainer = document.getElementById("chartContainer");
const chartCanvas = document.getElementById("statsChart");
const heroMetric = document.getElementById("heroMetric");
const articleResult = document.getElementById("articleResult");
const humanStat = document.getElementById("NotAIStat");
const aiStat = document.getElementById("AIGenStat");
const AISwitch = document.getElementById("AICheck");
let chart = null;

function renderChart(humanPercent, aiPercent) {
  if (humanPercent === 0 && aiPercent === 0) {
    chartContainer.classList.add("hidden");
  } else {
    chartContainer.classList.remove("hidden");
  }

  const chartData = {
    labels: ["Human", "AI Generated"],
    datasets: [
      {
        data: [humanPercent, aiPercent],
        backgroundColor: ["#00F615", "#F60004"],
        cutout: "70%",
        borderWidth: 0,
      },
    ],
  };

  if (chart) chart.destroy();

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
  const { label, averageAIScore, humanPercent, aiPercent } = data;

  renderChart(humanPercent, aiPercent);

  humanStat.textContent = `${humanPercent}%`;
  aiStat.textContent = `${aiPercent}%`;

  // HERO = HUMAN SCORE
  heroMetric.textContent = `${averageAIScore}%`;

  // Label stays same (AI / Mixed / Human)
  articleResult.textContent = label;
}

chrome.storage.onChanged.addListener(function (data, name) {
  if (
    name === "local" &&
    data.articleAnalysis !== undefined &&
    data.articleAnalysis.newValue !== undefined
  ) {
    showResults(data.articleAnalysis.newValue);
  }
});

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
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        function: (selectedValue) => {
          chrome.storage.local.set({ switchStatus: selectedValue });
        },
        args: [AISwitch.checked],
      });
    }
  });
});
