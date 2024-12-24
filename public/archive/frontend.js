

    document.getElementById('stockForm').addEventListener('submit', async (event) => {
    event.preventDefault(); // Prevent form reload

    // Get user inputs
    const stockSymbol = document.getElementById('stockSymbol').value.trim();
    const startDate = document.getElementById('startDate').value;
    
    const endDate = document.getElementById('endDate').value;
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/; // Match YYYY-MM-DD format

    if (!dateRegex.test(startDate)) {
        console.error('Invalid date format. Please use YYYY-MM-DD.');
    } else {
        console.log(startDate); // Valid date
    }
    try {
        // Send data to the backend
        const response = await fetch('/api/simulation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stockSymbol, startDate, endDate })
        });

        if (!response.ok) throw new Error('This Error. Failed to fetch analysis');

        const analysis = await response.json();
        console.log(analysis);
        // Display statistics
        
        // displayStatistics(analysis);
        
        // Display chart
        // displayChart(analysis.dates, analysis.dailyPrices[stockSymbol]);

    } catch (error) {
        console.error('Error fetching stock analysis:', error.message);
        alert('Failed to fetch stock analysis. Please try again.');
    }
});

function displayStatistics(data) {
    const tableBody = document.querySelector('#statisticsTable tbody');
    tableBody.innerHTML = ''; // Clear existing data

    const metrics = [
        { name: 'Mean', value: data.mean.toFixed(2) },
        { name: 'Standard Deviation', value: data.standardDeviation.toFixed(2) },
        { name: 'Minimum Price', value: data.min.toFixed(2) },
        { name: 'Maximum Price', value: data.max.toFixed(2) },
        { name: 'Sharpe Ratio', value: data.sharpeRatio[data.tickers[0]].toFixed(2) },
    ];

    metrics.forEach((metric) => {
        const row = document.createElement('tr');
        row.innerHTML = `<td>${metric.name}</td><td>${metric.value}</td>`;
        tableBody.appendChild(row);
    });
}

function displayChart(dates, prices) {
    const ctx = document.getElementById('StockPriceChart').getContext('2d');

    // Destroy existing chart if exists
    if (window.stockChart) window.stockChart.destroy();

    window.stockChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [{
                label: 'Daily Prices',
                data: prices,
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 2,
                fill: false
            }]
        },
        options: {
            responsive: true,
            scales: {
                x: { title: { display: true, text: 'Dates' } },
                y: { title: { display: true, text: 'Price' } }
            }
        }
    });
}
