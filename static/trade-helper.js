(async function() {
    // A short delay to ensure the page elements are in the DOM
    await new Promise(resolve => setTimeout(resolve, 0));

    // --- Page-specific elements from trade-helper.html ---
    const loadingText = document.getElementById('trade-helper-loading');
    const skaterTableContainer = document.getElementById('skater-table-container');
    const goalieTableContainer = document.getElementById('goalie-table-container');
    const tradeFromSelect = document.getElementById('trade-from-select');
    const tradeToSelect = document.getElementById('trade-to-select');
    // --- NEW: Roster table elements ---
    const rosterLoadingText = document.getElementById('roster-loading');
    const rosterSkaterTableContainer = document.getElementById('roster-skater-table-container');
    const rosterGoalieTableContainer = document.getElementById('roster-goalie-table-container');


    // --- Global elements from home.html ---
    const yourTeamSelect = document.getElementById('your-team-select');

    // --- NEW: Heatmap function (from lineups.js) ---
    function getHeatmapColor(rank) {
        if (rank === null || rank === undefined || rank === '-' || isNaN(rank)) {
            return ''; // No color for empty ranks
        }
        const minRank = 1;
        const maxRank = 20;
        const clampedRank = Math.max(minRank, Math.min(rank, maxRank));
        const percentage = (clampedRank - minRank) / (maxRank - minRank);
        // Hue: 0 (red) to 120 (green).
        const hue = (1 - percentage) * 120;
        // Using HSL: matching the pastel color from lineups.js (65% saturation, 75% lightness)
        return `hsl(${hue}, 65%, 75%)`;
    }

    // Main initialization function for this page
    async function init() {
        if (!loadingText || !skaterTableContainer || !goalieTableContainer || !yourTeamSelect ||
            !tradeFromSelect || !tradeToSelect || !rosterLoadingText || !rosterSkaterTableContainer || !rosterGoalieTableContainer) {
            console.error('Trade Helper script failed: Required DOM elements are missing.');
            if (loadingText) {
                loadingText.textContent = 'Error: Page elements failed to load. Please reload.';
                loadingText.classList.add('text-red-400');
            }
            return;
        }

        // Add event listeners
        yourTeamSelect.addEventListener('change', () => {
            // Fetch both sets of data when team changes
            fetchTradeHelperData();
            fetchRosterData();
        });

        // Initial data load
        await Promise.all([
            fetchTradeHelperData(),
            fetchRosterData()
        ]);
    }

    async function fetchTradeHelperData() {
        const selectedTeam = localStorage.getItem('selectedTeam');
        const selectedWeek = 'all';

        if (!selectedTeam) {
            loadingText.textContent = "Please select your team from the dropdown above.";
            loadingText.classList.add('text-yellow-400');
            return;
        }

        loadingText.textContent = `Loading season data for ${selectedTeam}...`;
        loadingText.classList.add('text-gray-400');
        loadingText.classList.remove('text-yellow-400', 'text-red-400', 'text-green-400');
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

            if (data.all_scoring_categories) {
                populateCategoryDropdowns(data.all_scoring_categories);
            }

            if (data.skater_stats && data.goalie_stats) {
                loadingText.textContent = `Displaying season-to-date category analysis for ${selectedTeam}.`;
                loadingText.classList.remove('text-red-400', 'text-yellow-400');
                loadingText.classList.add('text-green-400');

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

    // --- NEW: Function to fetch roster data ---
    async function fetchRosterData() {
        const selectedTeam = localStorage.getItem('selectedTeam');

        if (!selectedTeam) {
            rosterLoadingText.textContent = "Select a team to see roster.";
            rosterLoadingText.classList.add('text-yellow-400');
            return;
        }

        rosterLoadingText.textContent = `Loading roster for ${selectedTeam}...`;
        rosterLoadingText.classList.add('text-gray-400');
        rosterLoadingText.classList.remove('text-yellow-400', 'text-red-400', 'text-green-400');
        rosterSkaterTableContainer.innerHTML = '';
        rosterGoalieTableContainer.innerHTML = '';

        try {
            const response = await fetch('/api/trade_helper_roster_data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ team_name: selectedTeam })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to fetch roster data.');
            }

            const data = await response.json();

            // Filter players
            const skaters = data.players.filter(p => !(p.eligible_positions || '').includes('G'));
            const goalies = data.players.filter(p => (p.eligible_positions || '').includes('G'));

            // Render tables
            renderRosterTable(rosterSkaterTableContainer, skaters, data.skater_categories, 'Skaters');
            renderRosterTable(rosterGoalieTableContainer, goalies, data.goalie_categories, 'Goalies');

            rosterLoadingText.textContent = ''; // Clear loading text

        } catch (error) {
            console.error('Error in fetchRosterData:', error);
            rosterLoadingText.textContent = `Error: ${error.message}`;
            rosterLoadingText.classList.remove('text-gray-400');
            rosterLoadingText.classList.add('text-red-400');
        }
    }

    function populateCategoryDropdowns(categories) {
        if (tradeFromSelect.options.length > 1) {
            return;
        }

        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            tradeFromSelect.appendChild(option);
            tradeToSelect.appendChild(option.cloneNode(true));
        });
    }

    // This is the render function for the TEAM category tables
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

    function renderRosterTable(container, players, categories, title) {
        if (!players || players.length === 0) {
            container.innerHTML = `<p class="text-gray-400">No ${title.toLowerCase()} found on roster.</p>`;
            return;
        }

        let tableHtml = `
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-700">
                    <thead class="bg-gray-700/50">
                        <tr>
                            <th scope="col" class="px-2 py-1 text-left text-xs font-bold text-gray-300 uppercase tracking-wider">Player</th>
                            <th scope="col" class="px-2 py-1 text-left text-xs font-bold text-gray-300 uppercase tracking-wider">Team</th>
                            <th scope="col" class="px-2 py-1 text-left text-xs font-bold text-gray-300 uppercase tracking-wider">Pos</th>
        `;

        categories.forEach(cat => {
            tableHtml += `<th scope="col" class="px-2 py-1 text-center text-xs font-bold text-gray-300 uppercase tracking-wider" title="${cat}">${cat.charAt(0)}</th>`;
        });

        tableHtml += `</tr></thead><tbody class="bg-gray-800 divide-y divide-gray-700">`;

        players.forEach(player => {
            tableHtml += `<tr class="hover:bg-gray-700/50">
                <td class="px-2 py-1 whitespace-nowrap text-sm font-medium text-gray-300">${player.player_name}</td>
                <td class="px-2 py-1 whitespace-nowrap text-sm text-gray-300">${player.team}</td>
                <td class="px-2 py-1 whitespace-nowrap text-sm text-gray-300">${player.eligible_positions}</td>
            `;

            categories.forEach(cat => {
                const rank_key = cat + '_cat_rank';
                let rank = player[rank_key];
                let rankDisplay = (rank !== null && rank !== undefined) ? Math.round(rank) : '-';
                const color = getHeatmapColor(rank);

                // --- MODIFIED: Changed text color to match lineups.js ---
                const textColor = 'text-gray-600';

                tableHtml += `<td class="px-2 py-1 whitespace-nowrap text-sm text-center font-semibold ${textColor}" style="background-color: ${color};" title="${cat}: ${rankDisplay}">${rankDisplay}</td>`;
            });

            tableHtml += `</tr>`;
        });

        tableHtml += `</tbody></table></div>`;
        container.innerHTML = tableHtml;
    }


    // Run the initialization function
    init().catch(err => {
        console.error("Failed to initialize Trade Helper page:", err);
        if (loadingText) {
            loadingText.textContent = 'A critical error occurred while loading the page.';
            loadingText.classList.add('text-red-400');
        }
        if (rosterLoadingText) {
            rosterLoadingText.textContent = 'A critical error occurred while loading the roster.';
            rosterLoadingText.classList.add('text-red-400');
        }
    });

})();
