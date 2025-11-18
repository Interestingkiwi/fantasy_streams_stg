(async function() {
    // A short delay to ensure the page elements are in the DOM
    await new Promise(resolve => setTimeout(resolve, 0));

    // --- Page-specific elements from trade-helper.html ---
    const loadingText = document.getElementById('trade-helper-loading');
    const skaterTableContainer = document.getElementById('skater-table-container');
    const goalieTableContainer = document.getElementById('goalie-table-container');
    const tradeFromSelect = document.getElementById('trade-from-select');
    const tradeToSelect = document.getElementById('trade-to-select');
    // --- Roster table elements ---
    const rosterLoadingText = document.getElementById('roster-loading');
    const rosterSkaterTableContainer = document.getElementById('roster-skater-table-container');
    const rosterGoalieTableContainer = document.getElementById('roster-goalie-table-container');
    // --- Opponent Roster ---
    const opponentSkaterTableContainer = document.getElementById('opponent-skater-table-container');
    const opponentGoalieTableContainer = document.getElementById('opponent-goalie-table-container');
    const opponentSkaterSection = document.getElementById('opponent-skater-section');
    const opponentGoalieSection = document.getElementById('opponent-goalie-section');


    // --- Global elements from home.html ---
    const yourTeamSelect = document.getElementById('your-team-select');


    let allPlayers = []; // Now holds ALL rostered players in the league
    let skaterCategories = [];
    let goalieCategories = [];
    let userTeamName = ''; // Global to hold the selected team name


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
            // --- MODIFIED: Call new league data function ---
            fetchLeagueRosterData();
        });

        // --- MODIFIED: Both call the same render function, which now handles dual-sorting ---
        tradeFromSelect.addEventListener('change', renderSortedRosterTables);
        tradeToSelect.addEventListener('change', renderSortedRosterTables);

        // Initial data load
        await Promise.all([
            fetchTradeHelperData(),
            // --- MODIFIED: Call new league data function ---
            fetchLeagueRosterData()
        ]);
    }

    async function fetchTradeHelperData() {
        const selectedTeam = localStorage.getItem('selectedTeam');
        const selectedWeek = 'all';
        userTeamName = selectedTeam; // Set the global variable

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

    // --- MODIFIED: Function to fetch LEAGUE-WIDE roster data ---
    async function fetchLeagueRosterData() {
        const selectedTeam = localStorage.getItem('selectedTeam');
        userTeamName = selectedTeam;

        if (!selectedTeam) {
            rosterLoadingText.textContent = "Select a team to see roster.";
            rosterLoadingText.classList.add('text-yellow-400');
            return;
        }

        rosterLoadingText.textContent = `Loading ALL league rosters and ranks...`;
        rosterLoadingText.classList.add('text-gray-400');
        rosterLoadingText.classList.remove('text-yellow-400', 'text-red-400', 'text-green-400');
        rosterSkaterTableContainer.innerHTML = '';
        rosterGoalieTableContainer.innerHTML = '';
        opponentSkaterTableContainer.innerHTML = '';
        opponentGoalieTableContainer.innerHTML = '';

        const selectedSourcing = localStorage.getItem('selectedStatSourcing') || 'projected';
        try {
            // --- MODIFIED: New API endpoint (must be added to app.py) ---
            const response = await fetch('/api/trade_helper_league_roster_data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sourcing: selectedSourcing })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to fetch league roster data.');
            }

            const data = await response.json();

            // --- Store ALL rostered player data ---
            allPlayers = data.players || [];
            skaterCategories = data.skater_categories || [];
            goalieCategories = data.goalie_categories || [];

            // --- Call the render function to split and display ---
            renderSortedRosterTables();

            rosterLoadingText.textContent = ''; // Clear loading text

        } catch (error) {
            console.error('Error in fetchLeagueRosterData:', error);
            rosterLoadingText.textContent = `Error loading league rosters: ${error.message}`;
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


    function renderSortedRosterTables() {
        // --- MODIFIED: Get two categories ---
        const tradeFromCategory = tradeFromSelect.value;
        const tradeToCategory = tradeToSelect.value;

        // Define the two rank keys
        const tradeFromRankKey = tradeFromCategory ? `${tradeFromCategory}_cat_rank` : null;
        const tradeToRankKey = tradeToCategory ? `${tradeToCategory}_cat_rank` : null;
        // --- END MODIFIED ---

        // Ensure data is loaded
        if (!allPlayers || allPlayers.length === 0 || !userTeamName) {
            return;
        }

        // 1. Filter and Split Rosters (now filtering from league-wide allPlayers)
        const userPlayers = allPlayers.filter(p => p.fantasy_team_name === userTeamName);
        const userSkaters = userPlayers.filter(p => !(p.eligible_positions || '').includes('G'));
        const userGoalies = userPlayers.filter(p => (p.eligible_positions || '').includes('G'));

        // Filter for ALL OPPONENT TEAMS (exclude the user's team and Free Agents)
        const oppPlayers = allPlayers.filter(p => p.fantasy_team_name !== userTeamName && p.fantasy_team_name !== 'Free Agent');
        const oppSkaters = oppPlayers.filter(p => !(p.eligible_positions || '').includes('G'));
        const oppGoalies = oppPlayers.filter(p => (p.eligible_positions || '').includes('G'));


        // 2. Sorting Functions (DUAL SORT IMPLEMENTATION)
        // Function for User Roster (sorts by Trade From category)
        const sortUserRosterFn = (a, b) => {
            if (!tradeFromRankKey) return 0;

            const rankA = a[tradeFromRankKey];
            const rankB = b[tradeFromRankKey];

            // Push nulls/undefined/0 to the end (higher rank number is worse)
            if (rankA === null || rankA === undefined || rankA === 0) return 1;
            if (rankB === null || rankB === undefined || rankB === 0) return -1;

            return rankA - rankB; // Ascending sort (1 is better than 20)
        };

        // Function for Opponent Roster (sorts by Trade To category)
        const sortOpponentRosterFn = (a, b) => {
            if (!tradeToRankKey) return 0;

            const rankA = a[tradeToRankKey];
            const rankB = b[tradeToRankKey];

            // Push nulls/undefined/0 to the end (higher rank number is worse)
            if (rankA === null || rankA === undefined || rankA === 0) return 1;
            if (rankB === null || rankB === undefined || rankB === 0) return -1;

            return rankA - rankB; // Ascending sort (1 is better than 20)
        };

        // Apply Sort
        userSkaters.sort(sortUserRosterFn);
        userGoalies.sort(sortUserRosterFn);
        oppSkaters.sort(sortOpponentRosterFn);
        oppGoalies.sort(sortOpponentRosterFn);
        // --- END DUEL SORT IMPLEMENTATION ---


        // 3. Table Swapping Logic (uses Trade To Category)
        const isGoalieCategory = goalieCategories.includes(tradeToCategory);

        const userSkaterContainer = document.getElementById('roster-skater-table-container');
        const userGoalieContainer = document.getElementById('roster-goalie-table-container');

        // Render User Roster (No swapping needed for the fixed containers)
        renderRosterTable(userSkaterContainer, userSkaters, skaterCategories, 'Team Skaters', false);
        renderRosterTable(userGoalieContainer, userGoalies, goalieCategories, 'Team Goalies', false);


        // 4. Render Opponent Roster and Swap Sections
        renderRosterTable(opponentSkaterTableContainer, oppSkaters, skaterCategories, 'Opponent Skaters', true);
        renderRosterTable(opponentGoalieTableContainer, oppGoalies, goalieCategories, 'Opponent Goalies', true);

        // Swap the visual order of the sections
        if (isGoalieCategory) {
            opponentGoalieSection.style.order = 1; // Move goalie section to the top
            opponentSkaterSection.style.order = 2; // Move skater section below
        } else {
            opponentSkaterSection.style.order = 1;
            opponentGoalieSection.style.order = 2;
        }

    }

    function renderRosterTable(container, players, categories, title, showFantasyTeamColumn = false) {
        if (!players || players.length === 0) {
            container.innerHTML = `<p class="text-gray-400">No ${title.toLowerCase()} found on roster.</p>`;
            return;
        }

        const headers = ['Player', 'Team', 'Pos'];
        if (showFantasyTeamColumn) {
            // Insert Fantasy Team column after Player Name (index 1)
            headers.splice(1, 0, 'Fantasy Team');
        }

        let tableHtml = `
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-700">
                    <thead class="bg-gray-700/50">
                        <tr>
                            ${headers.map(h => `<th scope="col" class="px-2 py-1 text-left text-xs font-bold text-gray-300 uppercase tracking-wider">${h}</th>`).join('')}
                            ${categories.map(cat => `<th scope="col" class="px-2 py-1 text-center text-xs font-bold text-gray-300 uppercase tracking-wider" title="${cat}">${cat}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody class="bg-gray-800 divide-y divide-gray-700">
        `;

        players.forEach(player => {
            tableHtml += `<tr class="hover:bg-gray-700/50">
                <td class="px-2 py-1 whitespace-nowrap text-sm font-medium text-gray-300">${player.player_name}</td>

                ${showFantasyTeamColumn ? `<td class="px-2 py-1 whitespace-nowrap text-sm text-yellow-300">${player.fantasy_team_name}</td>` : ''}

                <td class="px-2 py-1 whitespace-nowrap text-sm text-gray-300">${player.player_team}</td>
                <td class="px-2 py-1 whitespace-nowrap text-sm text-gray-300">${player.eligible_positions}</td>
            `;

            categories.forEach(cat => {
                const rank_key = cat + '_cat_rank';
                let rank = player[rank_key];
                let rankDisplay = (rank !== null && rank !== undefined) ? Math.round(rank) : '-';
                const color = getHeatmapColor(rank);

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
