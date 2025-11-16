document.addEventListener('DOMContentLoaded', () => {
    // These are the dropdowns from the parent home.html
    const weekSelect = document.getElementById('week-select');
    const yourTeamSelect = document.getElementById('your-team-select');

    // Containers within trade-helper.html
    const loadingText = document.getElementById('trade-helper-loading');
    const skaterTableContainer = document.getElementById('skater-table-container');
    const goalieTableContainer = document.getElementById('goalie-table-container');

    async function fetchTradeHelperData() {
        const selectedTeam = localStorage.getItem('selectedTeam');
        // We always use 'all' for this page to get season totals
        const selectedWeek = 'all';

        if (!selectedTeam) {
            loadingText.textContent = "Please select your team from the dropdown above.";
            loadingText.classList.remove('text-gray-400');
            loadingText.classList.add('text-yellow-400');
            return;
        }

        loadingText.textContent = `Loading season data for ${selectedTeam}...`;
        loadingText.classList.add('text-gray-400');
        loadingText.classList.remove('text-yellow-400', 'text-red-400');
        skaterTableContainer.innerHTML = '';
        goalieTableContainer.innerHTML = '';

        try {
            const response = await fetch('/api/trade_helper_data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    team_name: selectedTeam,
                    week: selectedWeek
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to fetch data.');
            }

            const data = await response.json();

            if (data.skater_stats && data.goalie_stats) {
                loadingText.textContent = `Displaying season-to-date category analysis for ${selectedTeam}.`;
                loadingText.classList.remove('text-red-400', 'text-yellow-400');
                loadingText.classList.add('text-green-400');

                // Define headers based on user request
                const skaterHeaders = ['category', 'Rank', 'Average Delta', 'Total'];
                const goalieHeaders = ['category', 'Rank', 'Average Delta', 'Total'];

                renderTable(skaterTableContainer, data.skater_stats, skaterHeaders, 'Skater Stats');
                renderTable(goalieTableContainer, data.goalie_stats, goalieHeaders, 'Goalie Stats');
            } else {
                throw new Error("Received incomplete data from server.");
            }

        } catch (error) {
            console.error('Error in fetchTradeHelperData:', error);
            loadingText.textContent = `Error: ${error.message}`;
            loadingText.classList.remove('text-gray-400', 'text-green-400');
            loadingText.classList.add('text-red-400');
        }
    }

    function renderTable(container, data, headers, title) {
        if (!data || data.length === 0) {
            container.innerHTML = `<p class="text-gray-400">No ${title.toLowerCase()} data found.</p>`;
            return;
        }

        const table = document.createElement('table');
        table.className = 'min-w-full divide-y divide-gray-700 bg-gray-800';

        // Create Header
        const thead = document.createElement('thead');
        thead.className = 'bg-gray-750';
        let headerRow = '<tr>';
        headers.forEach(header => {
            let thClass = 'px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider';
            if (header === 'Rank' || header === 'Average Delta' || header === 'Total') {
                thClass += ' text-center';
            }
            headerRow += `<th scope="col" class="${thClass}">${header.replace('_', ' ')}</th>`;
        });
        headerRow += '</tr>';
        thead.innerHTML = headerRow;
        table.appendChild(thead);

        // Create Body
        const tbody = document.createElement('tbody');
        tbody.className = 'divide-y divide-gray-700';

        data.forEach(rowData => {
            let row = '<tr class="hover:bg-gray-700">';
            headers.forEach(header => {
                let value = rowData[header];
                let tdClass = 'px-4 py-3 whitespace-nowrap text-sm text-white';

                if (header === 'category') {
                    tdClass += ' font-medium';
                } else {
                    tdClass += ' text-center'; // Center-align numeric data
                }

                // Add color coding for Rank and Avg Delta
                if (header === 'Rank') {
                    const rank = parseInt(value);
                    if (rank <= 3) tdClass += ' text-green-400';
                    else if (rank >= 8) tdClass += ' text-red-400';
                    else tdClass += ' text-yellow-400';
                } else if (header === 'Average Delta') {
                    const delta = parseFloat(value);
                    if (delta > 0.5) tdClass += ' text-green-400';
                    else if (delta < -0.5) tdClass += ' text-red-400';
                }

                row += `<td class="${tdClass}">${value}</td>`;
            });
            row += '</tr>';
            tbody.innerHTML += row;
        });
        table.appendChild(tbody);

        container.innerHTML = ''; // Clear loading/previous table
        container.appendChild(table);
    }

    // --- Event Listeners ---

    // Initial data load when the script runs (i.e., when the page is loaded)
    fetchTradeHelperData();

    // Add listeners to the main dropdowns in home.html to re-fetch data
    // when the user changes team. This script will only be active when
    // trade-helper.html is loaded, so these listeners won't conflict.
    if (yourTeamSelect) {
        yourTeamSelect.addEventListener('change', fetchTradeHelperData);
    }

    // Note: We don't listen to weekSelect because this page *always* shows 'all' data.
});
