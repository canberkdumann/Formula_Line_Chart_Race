define(["jquery", "text!./LineChartRace.css", "./d3.min"], function ($, cssContent) {
    "use strict";
    $("<style>").html(cssContent).appendTo("head");
  
    function fetchAllData(qHyperCube, backendApi, callback) {
      const pageHeight = 10000;
      const totalHeight = Math.min(qHyperCube.qSize.qcy, 30000);
      const pages = Math.ceil(totalHeight / pageHeight);
      let allData = [];
      let pending = pages;
  
      for (let i = 0; i < pages; i++) {
        backendApi.getData([{
          qTop: i * pageHeight,
          qLeft: 0,
          qWidth: qHyperCube.qSize.qcx,
          qHeight: pageHeight
        }]).then(dataPages => {
          if (dataPages[0] && dataPages[0].qMatrix) {
            allData = allData.concat(dataPages[0].qMatrix);
          }
          pending--;
          if (pending === 0) {
            callback(allData);
          }
        });
      }
    }
  
    function parseDateDDMMYYYY(str) {
      const [day, month, year] = str.split(".").map(Number);
      return new Date(year, month - 1, day);
    }
  
    let animationTimer = null;
    let isPaused = false;
    let isFinished = false;
    let currentIndex = 0;
    
    let selectedName = null;
  
  
    return {
      initialProperties: {
        version: 1.3,
        qHyperCubeDef: {
          qDimensions: [
            { qDef: { qFieldDefs: ["YourNameDimension"] } },
            { qDef: { qFieldDefs: ["YourPhotoURLDimension"] } },
            { qDef: { qFieldDefs: ["YourDateDimension"] } }
          ],
          qMeasures: [{ qDef: { qDef: "YourMeasureExpression" } }],
          qInitialDataFetch: [{ qWidth: 4, qHeight: 1 }]
        }
      },
      definition: {
        type: "items",
        component: "accordion",
        items: {
          dimensions: { uses: "dimensions", min: 3, max: 3 },
          measures: { uses: "measures", min: 1, max: 1 },
          sorting: { uses: "sorting" },
          settings: {
            uses: "settings",
            items: {
              competitorLimit: {
                ref: "props.numberOfCompetitors",
                label: "Number of Competitors",
                type: "number",
                defaultValue: 10,
                expression: "optional",
                min: 1,
                max: 33
              },
              animationSpeed: {
                ref: "props.animationSpeed",
                label: "Animation Speed",
                type: "string",
                component: "dropdown",
                options: [
                  { value: "slow", label: "🐢 Slow" },
                  { value: "normal", label: "🚶 Normal" },
                  { value: "fast", label: "🏃 Fast" }
                ],
                defaultValue: "normal"
              }
            }
          }
        }
      },
      snapshot: { canTakeSnapshot: true },
      paint: function ($element, layout) {
        if (animationTimer) {
          clearTimeout(animationTimer);
          animationTimer = null;
        }
  
        isPaused = false;
        isFinished = false;
        currentIndex = 0;
  
        const speedMap = { slow: 1200, normal: 800, fast: 400 };
        const animationDuration = speedMap[layout?.props?.animationSpeed] || 800;
  
        const backendApi = this.backendApi;
        const qHyperCube = layout.qHyperCube;
        const width = $element.width(), height = $element.height();
        const id = "container_" + layout.qInfo.qId;
  
        $element.empty();
        d3.select(`#${id}`).remove();
  
        const container = $(`<div id="${id}" style="position: relative;"></div>`);
        $element.append(container);
  
        const svg = d3.select(`#${id}`).append("svg")
          .attr("width", width)
          .attr("height", height)
          .append("g")
          .attr("transform", `translate(100,30)`);
          
          // ✅ Glow (neon) efekti tanımı
  const defs = svg.append("defs");
  
  const glowFilter = defs.append("filter")
    .attr("id", "glow-effect")
    .attr("x", "-50%")
    .attr("y", "-50%")
    .attr("width", "200%")
    .attr("height", "200%");
  
  glowFilter.append("feGaussianBlur")
    .attr("in", "SourceGraphic")
    .attr("stdDeviation", 3) // 🎨 yumuşaklık seviyesi
    .attr("result", "blurOut");
  
  glowFilter.append("feMerge")
    .selectAll("feMergeNode")
    .data(["blurOut", "SourceGraphic"])
    .enter()
    .append("feMergeNode")
    .attr("in", d => d);
  
  
        fetchAllData(qHyperCube, backendApi, function (fullMatrix) {
          const data = fullMatrix.map(d => ({
            Name: d[0].qText,
            ProfileImage: d[1].qText,
            Date: d[2].qText,
            Metric1: d[3].qNum
          }));
  
          const selectedTheme = layout?.props?.colorTheme || "pastel";
          const competitorLimit = parseInt(layout?.props?.numberOfCompetitors || "10", 10);
  
          const colorPalettes = {
            pastel: ["#FFB3BA", "#FFDFBA", "#FFFFBA", "#BAFFC9", "#BAE1FF", "#E1BAFF", "#FFC3E3", "#D4A5A5", "#A5D4A5", "#A5A5D4"]
          };
  
          const innerWidth = width - 200;
          const innerHeight = height - 130;
  
          const xScale = d3.time.scale().range([0, innerWidth - 170]);
          const yScale = d3.scale.linear().range([innerHeight, 0]).domain([0.5, 1.5]);
  
          const allDates = Array.from(new Set(data.map(d => d.Date))).sort((a, b) => parseDateDDMMYYYY(a) - parseDateDDMMYYYY(b));
          const allNames = Array.from(new Set(data.map(d => d.Name)));
  
          const grouped = d3.nest()
            .key(d => d.Name)
            .entries(data)
            .slice(0, competitorLimit);
  
          const colorScale = d3.scale.ordinal()
            .domain(allNames)
            .range(colorPalettes[selectedTheme] || colorPalettes.pastel);
  
          const line = d3.svg.line()
            .x(d => xScale(parseDateDDMMYYYY(d.Date)))
            .y(d => yScale(d.Metric1))
            .interpolate("monotone");
  
          const xAxisGroup = svg.append("g")
            .attr("class", "x axis")
            .attr("transform", `translate(0,${innerHeight})`);
  
          svg.append("g")
            .attr("class", "y axis")
            .call(
              d3.svg.axis()
                .scale(yScale)
                .orient("left")
                .tickValues(d3.range(0.50, 1.51, 0.1))
                .tickFormat(d3.format(".1f"))
            );
            
            // ✅ Yatay grid çizgileri (1.5, 1.4, 1.3, ...)
  svg.selectAll(".y-grid-line")
    .data(d3.range(0.50, 1.51, 0.1))
    .enter()
    .append("line")
    .attr("class", "y-grid-line")
    .attr("x1", 0)
    .attr("x2", innerWidth - 145) // → en sağa kadar gitsin
    .attr("y1", d => yScale(d))
    .attr("y2", d => yScale(d))
    .style("stroke", "#000000")            // soluk gri renk
    .style("stroke-opacity", 0.2)       // şeffaflık
    .style("stroke-dasharray", "2,2");  // nokta nokta çizgi
  
  
          const userLines = svg.selectAll(".user-line")
            .data(grouped)
            .enter()
            .append("g")
            .attr("class", "user-line");
  
         userLines.append("path")
    .attr("class", "line")
    .attr("fill", "none")
    .attr("stroke", d => colorScale(d.key))
    .attr("stroke-width", 2)
    .style("filter", "url(#glow-effect)");
  
  
          userLines.append("image")
            .attr("class", "profile-dot")
            .attr("width", 40)
            .attr("height", 40)
            .attr("clip-path", "circle(20px at 20px 20px)");
  
          const boxHeight = competitorLimit * 25 + 10;
  
          const rankingBox = svg.append("g")
            .attr("id", "ranking-box")
            .attr("transform", `translate(${innerWidth - 135}, ${innerHeight - boxHeight})`);
  
          rankingBox.append("rect")
            .attr("width", 230)
            .attr("height", boxHeight)
            .attr("rx", 12)
            .attr("ry", 12)
            .attr("fill", "#fff")
            .attr("stroke", "#ccc")
            .attr("stroke-width", 2);
  
          const content = rankingBox.append("g").attr("id", "ranking-content");
  
       const button = d3.select(`#${id}`).append("button")
    .attr("id", "race-button")
    .style("position", "absolute")
    .style("top", `${innerHeight - boxHeight - 20}px`)
    .style("left", `${innerWidth + 124}px`)
    .style("width", "70px")
    .style("height", "30px")
    .style("font-size", "15px")
    .style("cursor", "pointer")
    .style("border", "none")
    .style("border-radius", "6px")
    .style("background", "#FF4136")
    .style("color", "white")
    .style("font-weight", "bold")
    .style("box-shadow", "0 4px 10px rgba(0, 0, 0, 0.2)") // 🧱 Gölge
    .style("transition", "all 0.2s ease") // ✨ Yumuşak geçiş
    .on("mouseover", function () {
      d3.select(this)
        .style("opacity", "0.9")
        .style("box-shadow", "0 6px 14px rgba(0, 0, 0, 0.3)"); // Hover gölge
    })
    .on("mouseout", function () {
      d3.select(this)
        .style("opacity", "1")
        .style("box-shadow", "0 4px 10px rgba(0, 0, 0, 0.2)"); // Varsayılan
    })
    .text("Pause")
    .on("click", function () {
      if (!isFinished) {
        isPaused = !isPaused;
        d3.select(this)
          .text(isPaused ? "Play" : "Pause")
          .style("background", isPaused ? "#2ECC40" : "#FF4136");
        if (!isPaused) step();
      } else {
        currentIndex = 0;
        isFinished = false;
        d3.select(this)
          .text("Pause")
          .style("background", "#FF4136");
        step();
      }
    });
  
  
  
          function step() {
            if (isPaused || isFinished) return;
  if (currentIndex >= allDates.length) {
    isFinished = true;
    d3.select("#race-button")
      .text("Restart")
      .style("background", "#555");
  
    // 👇 Show all dates after race ends
    updateToDate("FULL");
    return;
  }
  
            updateToDate(allDates[currentIndex]);
            currentIndex++;
            animationTimer = setTimeout(step, animationDuration);
          }
  
          function updateToDate(currentDate) {
            const windowSize = 10;
  let visibleDates = [];
  
  if (currentDate === "FULL") {
    visibleDates = allDates; // 🔁 Show everything after race
  } else {
    const currentIdx = allDates.findIndex(d => d === currentDate);
    const startIndex = Math.max(0, currentIdx - windowSize + 1);
    visibleDates = allDates.slice(startIndex, currentIdx + 1);
  }
  
  
            const dateObjects = visibleDates.map(parseDateDDMMYYYY);
            const minDate = new Date(dateObjects[0]);
            const maxDate = new Date(dateObjects[dateObjects.length - 1]);
  
            xScale.domain([minDate, maxDate]);
  
            xAxisGroup.transition()
              .duration(animationDuration - 100)
              .ease("linear")
              .call(
                d3.svg.axis()
                  .scale(xScale)
                  .orient("bottom")
                  .tickValues(() => {
    if (currentDate === "FULL") {
      // 📆 Only one tick per month
      const monthsSeen = new Set();
      return dateObjects.filter(d => {
        const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
        if (monthsSeen.has(monthKey)) return false;
        monthsSeen.add(monthKey);
        return true;
      });
    }
    return dateObjects;
  })
  
                 .tickFormat(d => {
    if (currentDate === "FULL") {
      // 📆 Show only month names when race is over
      return d.toLocaleString('default', { month: 'long' });
    }
    // 📅 During race: show full DD.MM.YYYY
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  })
  
              )
         .selectAll("text")
  .style("text-anchor", currentDate === "FULL" ? "middle" : "end")
  .attr("dx", currentDate === "FULL" ? "0em" : "-0.8em")
  .attr("dy", "0.8em")
  .attr("transform", currentDate === "FULL" ? null : "rotate(-45)");
  
  
            userLines.select("path")
              .transition()
              .duration(animationDuration - 100)
              .ease("linear")
              .style("opacity", d => selectedName && d.key !== selectedName ? 0.2 : 1)
              .attr("d", d => line(d.values.filter(v => visibleDates.includes(v.Date))));
  
            userLines.select(".profile-dot")
              .transition()
              .duration(animationDuration - 100)
              .ease("linear")
              .attr("href", d => {
                const latest = d.values.filter(v => visibleDates.includes(v.Date)).slice(-1)[0];
                return latest?.ProfileImage || "";
              })
              .attr("x", d => {
                const latest = d.values.filter(v => visibleDates.includes(v.Date)).slice(-1)[0];
                return xScale(parseDateDDMMYYYY(latest?.Date)) - 20;
              })
              .attr("y", d => {
                const latest = d.values.filter(v => visibleDates.includes(v.Date)).slice(-1)[0];
                return yScale(latest?.Metric1) - 20;
              })
   .style("filter", d => {
    if (selectedName && d.key !== selectedName) return "grayscale(1) opacity(0.4)";
    return "drop-shadow(0 0 8px gold)";
  });
  
  
            content.selectAll("*").remove();
  
            const currentStandings = grouped.map(group => {
              const latest = group.values.filter(v => visibleDates.includes(v.Date)).slice(-1)[0];
              return { name: group.key, metric: latest?.Metric1 || 0 };
            }).sort((a, b) => b.metric - a.metric);
  
  currentStandings.forEach((d, i) => {
    const y = 25 + i * 25;
  
    // Sıra numarası (kırmızı)
    content.append("text")
      .attr("x", 10)
      .attr("y", y)
      .attr("fill", "red")
      .attr("font-size", "13px")
      .text(`${i + 1}.`);
  
  content.append("text")
    .attr("x", 35)
    .attr("y", y)
    .attr("font-size", "13px")
    .style("cursor", "pointer")
    .attr("fill", d.name === selectedName ? "#D2042D" : "black") // 🍒 Cherry red if selected
    .text(`${d.name} - ${d.metric.toFixed(2)}`)
    .on("mouseover", function () {
      if (d.name !== selectedName) d3.select(this).attr("fill", "#D2042D");
    })
    .on("mouseout", function () {
      d3.select(this).attr("fill", d.name === selectedName ? "#D2042D" : "black");
    })
  .on("click", function () {
    if (selectedName === d.name) {
      selectedName = null;
    } else {
      selectedName = d.name;
    }
  
    // 👇 If race is finished, show full history when selecting
    const currentDateToUse = isFinished ? "FULL" : allDates[currentIndex - 1];
    updateToDate(currentDateToUse);
  });
  
  
  
  
  });
  
  
          }
  
          step();
        });
      }
    };
  });