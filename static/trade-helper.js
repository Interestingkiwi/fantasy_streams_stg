(async function() {
    // A short delay to ensure the page elements are in the DOM
    await new Promise(resolve => setTimeout(resolve, 0));

    // --- Global Elements ---
    const loadingText = document.getElementById('trade-helper-loading');
    const tradeFromSelect = document.getElementById('trade-from-select');
    const tradeToSelect = document.getElementById('trade-to-select');
    const tradeFromTags = document.getElementById('trade-from-tags');
    const tradeToTags = document.getElementById('trade-to-tags');
    const yourTeamSelect = document.getElementById('your-team-select');
    const navPartners = document.getElementById('nav-partners');
    const navCompare = document.getElementById('nav-compare');
    const subpageContent = document.getElementById('subpage-content');

    // --- State Variables ---
    let currentSubPage = 'trade-partners';
    let userTeamName = localStorage.getItem('selectedTeam') || '';

    // Multi-Sort State
    let activeFromCats = [];
    let activeToCats = [];

    // --- Data Store ---
    let categoryData = { skater_stats: [], goalie_stats: [] };
    let rosterData = { players: [], skaterCategories: [], goalieCategories: [] };

    // --- Heatmap Helper ---
    function getHeatmapColor(rank) {
        if (rank === null || rank === undefined || rank === '-' || isNaN(rank)) { return ''; }
        const minRank = 1; const maxRank = 20;
        const clampedRank = Math.max(minRank, Math.min(rank, maxRank));
        const percentage = (clampedRank - minRank) / (maxRank - minRank);
        const hue = (1 - percentage) * 120;
        return `hsl(${hue}, 65%, 75%)`;
    }

    // --- Initialization ---
    async function init() {
        if (!tradeFromSelect || !tradeToSelect || !yourTeamSelect || !subpageContent) {
            console.error('Trade Helper: Critical elements missing.');
            return;
        }

        // 1. Global Controls Listeners
        yourTeamSelect.addEventListener('change', () => {
            userTeamName = yourTeamSelect.value;
            fetchAllData();
        });

        // New Multi-Sort Listeners
        tradeFromSelect.addEventListener('change', (e) => {
            if (e.target.value) {
                addCategory('from', e.target.value);
                e.target.value = ""; // Reset dropdown
            }
        });

        tradeToSelect.addEventListener('change', (e) => {
            if (e.target.value) {
                addCategory('to', e.target.value);
                e.target.value = ""; // Reset dropdown
            }
        });

        // 2. Nav Listeners
        if(navPartners) navPartners.onclick = () => loadSubPage('trade-partners');
        if(navCompare) navCompare.onclick = () => loadSubPage('trade-compare');

        // 3. Initial Load
        await loadSubPage('trade-partners');
        fetchAllData();
    }

    // --- Category Management (Tags) ---
    function addCategory(type, category) {
        const targetArray = type === 'from' ? activeFromCats : activeToCats;

        // Prevent duplicates
        if (!targetArray.includes(category)) {
            targetArray.push(category);
            updateTagsUI();
            renderCurrentPage();
        }
    }

    function removeCategory(type, category) {
        if (type === 'from') {
            activeFromCats = activeFromCats.filter(c => c !== category);
        } else {
            activeToCats = activeToCats.filter(c => c !== category);
        }
        updateTagsUI();
        renderCurrentPage();
    }

    function updateTagsUI() {
        renderTags(tradeFromTags, activeFromCats, 'from');
        renderTags(tradeToTags, activeToCats, 'to');
    }

    function renderTags(container, tags, type) {
        container.innerHTML = '';
        tags.forEach(tag => {
            const pill = document.createElement('div');
            pill.className = 'inline-flex items-center bg-blue-900 text-blue-200 text-xs font-medium px-2.5 py-1 rounded border border-blue-700';
            pill.innerHTML = `
                ${tag}
                <button type="button" class="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full text-blue-200 hover:bg-blue-800 hover:text-white focus:outline-none">
                    <span class="sr-only">Remove</span>
                    &times;
                </button>
            `;
            // Add click listener to the button
            pill.querySelector('button').addEventListener('click', () => removeCategory(type, tag));
            container.appendChild(pill);
        });
    }


    // --- Navigation Logic ---
    window.loadSubPage = async function(pageName) {
        currentSubPage = pageName;

        if (navPartners && navCompare) {
            const activeClass = 'border-blue-500 text-blue-400';
            const inactiveClass = 'border-transparent text-gray-400 hover:text-gray-300';

            if (pageName === 'trade-partners') {
                navPartners.className = navPartners.className.replace(inactiveClass, '').replace('border-transparent', '') + ` ${activeClass}`;
                navCompare.className = navCompare.className.replace(activeClass, '') + ` ${inactiveClass}`;
            } else {
                navCompare.className = navCompare.className.replace(inactiveClass, '').replace('border-transparent', '') + ` ${activeClass}`;
                navPartners.className = navPartners.className.replace(activeClass, '') + ` ${inactiveClass}`;
            }
        }

        try {
            const response = await fetch(`/pages/${pageName}.html`);
            if (!response.ok) throw new Error(`Failed to load ${pageName}`);
            const html = await response.text();
            subpageContent.innerHTML = html;
            renderCurrentPage();
        } catch (err) {
            console.error(err);
            subpageContent.innerHTML = `<p class="text-red-400">Error loading content.</p>`;
        }
    };

    // --- Data Fetching (Unchanged) ---
    async function fetchAllData() {
        if (!userTeamName) {
            if(loadingText) loadingText.textContent = "Please select a team.";
            return;
        }
        if(loadingText) {
            loadingText.textContent = "Loading data...";
            loadingText.classList.remove('hidden');
        }
        await Promise.all([fetchCategoryStrengths(), fetchLeagueRosterData()]);
        if(loadingText) loadingText.textContent = "";
    }

    async function fetchCategoryStrengths() {
        try {
            const response = await fetch('/api/trade_helper_data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ team_name: userTeamName, week: 'all' })
            });
            const data = await response.json();
            categoryData = data;

            if (data.all_scoring_categories && tradeFromSelect.options.length <= 1) {
                populateDropdowns(data.all_scoring_categories);
            }
            if (currentSubPage === 'trade-partners') renderCurrentPage();
        } catch (err) { console.error(err); }
    }

    async function fetchLeagueRosterData() {
        const selectedSourcing = localStorage.getItem('selectedStatSourcing') || 'projected';
        try {
            const response = await fetch('/api/trade_helper_league_roster_data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sourcing: selectedSourcing })
            });
            const data = await response.json();
            rosterData.players = data.players || [];
            rosterData.skaterCategories = data.skater_categories || [];
            rosterData.goalieCategories = data.goalie_categories || [];
            if (currentSubPage === 'trade-compare') renderCurrentPage();
        } catch (err) { console.error(err); }
    }

    function populateDropdowns(categories) {
        let visibleCategories = [...categories];
        if (categories.includes('GAA')) visibleCategories = visibleCategories.filter(c => c !== 'GA' && c !== 'TOI/G');
        if (categories.includes('SVpct')) visibleCategories = visibleCategories.filter(c => c !== 'SV' && c !== 'SA');

        visibleCategories.forEach(cat => {
            const opt1 = document.createElement('option');
            opt1.value = cat; opt1.textContent = cat;
            tradeFromSelect.appendChild(opt1);
            const opt2 = document.createElement('option');
            opt2.value = cat; opt2.textContent = cat;
            tradeToSelect.appendChild(opt2);
        });
    }

    // --- Main Render Dispatcher ---
    function renderCurrentPage() {
        if (currentSubPage === 'trade-partners') {
            renderPartnersPage();
        } else if (currentSubPage === 'trade-compare') {
            renderComparePage();
        }
    }

    // --- Subpage 1: Trade Partners Logic ---
    function renderPartnersPage() {
        const skaterContainer = document.getElementById('skater-table-container');
        const goalieContainer = document.getElementById('goalie-table-container');
        const recContainer = document.getElementById('trade-recommendations-container');

        if (!skaterContainer || !goalieContainer) return;

        if (!categoryData.skater_stats) {
            skaterContainer.innerHTML = '<p class="text-gray-500">Loading stats...</p>';
            return;
        }

        const headers = ['category', 'Rank', 'Average Delta', 'Total'];
        renderSimpleTable(skaterContainer, categoryData.skater_stats, headers);
        renderSimpleTable(goalieContainer, categoryData.goalie_stats, headers);

        if (recContainer && categoryData.league_rank_matrix) {
            const matches = findTradeMatches(categoryData.league_rank_matrix, categoryData.total_teams);
            renderTradeMatches(recContainer, matches);
        }
    }

    // --- NEW: Logic to Find Matches ---
    function findTradeMatches(matrix, totalTeams) {
        const myRanks = matrix[userTeamName];
        if (!myRanks) return [];

        const strengthThreshold = Math.ceil(totalTeams / 3);
        const weaknessThreshold = totalTeams - Math.floor(totalTeams / 3) + 1;

        const allCats = Object.keys(myRanks);
        const excludedCats = [];
        if (allCats.includes('GAA')) excludedCats.push('GA', 'TOI/G');
        if (allCats.includes('SVpct')) excludedCats.push('SV', 'SA');

        let matches = [];

        for (const [teamName, teamRanks] of Object.entries(matrix)) {
            if (teamName === userTeamName) continue;
            let youGive = [];
            let youGet = [];

            for (const cat of allCats) {
                if (excludedCats.includes(cat)) continue;

                const myRank = myRanks[cat];
                const theirRank = teamRanks[cat];

                if (myRank <= strengthThreshold && theirRank >= weaknessThreshold) youGive.push(cat);
                if (myRank >= weaknessThreshold && theirRank <= strengthThreshold) youGet.push(cat);
            }

            if (youGive.length > 0 && youGet.length > 0) {
                matches.push({
                    team: teamName,
                    gives: youGive,
                    gets: youGet,
                    score: youGive.length + youGet.length
                });
            }
        }
        matches.sort((a, b) => b.score - a.score);
        return matches;
    }

    function renderTradeMatches(container, matches) {
        if (matches.length === 0) {
            container.innerHTML = `<div class="col-span-full text-center p-4 bg-gray-700/50 rounded-lg text-gray-300">No perfect matches found.</div>`;
            return;
        }
        let html = '';
        matches.forEach(m => {
            html += `
            <div class="bg-gray-700/40 border border-gray-600 rounded-lg p-4 hover:bg-gray-700/70 transition duration-200">
                <h4 class="text-lg font-bold text-white mb-3 border-b border-gray-600 pb-2">${m.team}</h4>
                <div class="mb-3">
                    <p class="text-xs uppercase text-gray-400 font-bold mb-1">You Give (Surplus):</p>
                    <div class="flex flex-wrap gap-2">${m.gives.map(cat => `<span class="px-2 py-1 text-xs font-bold rounded bg-green-900 text-green-200 border border-green-700">${cat}</span>`).join('')}</div>
                </div>
                <div>
                    <p class="text-xs uppercase text-gray-400 font-bold mb-1">You Get (Need):</p>
                    <div class="flex flex-wrap gap-2">${m.gets.map(cat => `<span class="px-2 py-1 text-xs font-bold rounded bg-blue-900 text-blue-200 border border-blue-700">${cat}</span>`).join('')}</div>
                </div>
            </div>`;
        });
        container.innerHTML = html;
    }

    function renderSimpleTable(container, data, headers) {
        if (!data || data.length === 0) { container.innerHTML = `<p class="text-gray-400 p-4">No data.</p>`; return; }
        let html = `<table class="min-w-full divide-y divide-gray-700 bg-gray-800 text-sm text-white"><thead class="bg-gray-750"><tr>`;
        headers.forEach(h => html += `<th class="px-4 py-3 text-left font-medium text-gray-300 uppercase">${h.replace('_', ' ')}</th>`);
        html += `</tr></thead><tbody class="divide-y divide-gray-700">`;

        data.forEach(row => {
            html += `<tr class="hover:bg-gray-700">`;
            headers.forEach(h => {
                let val = row[h];
                let classes = "px-4 py-3 whitespace-nowrap font-medium";
                if (h === 'Rank') {
                    const r = parseInt(val);
                    if (r <= 3) classes += ' text-green-400 font-bold';
                    else if (r >= 8) classes += ' text-red-400';
                    else classes += ' text-yellow-400';
                } else if (h === 'Average Delta') {
                    const d = parseFloat(val);
                    if (d > 0.5) classes += ' text-green-400';
                    else if (d < -0.5) classes += ' text-red-400';
                }
                html += `<td class="${classes}">${val}</td>`;
            });
            html += `</tr>`;
            if (row.sub_rows && row.sub_rows.length > 0) {
                row.sub_rows.forEach(sub => {
                    html += `<tr class="hover:bg-gray-700/50 bg-gray-800/40">`;
                    headers.forEach((h, index) => {
                        let val = sub[h];
                        html += index === 0 ? `<td class="px-4 py-2 text-xs text-gray-400 pl-8 border-l-2 border-gray-600">${val}</td>` : `<td class="px-4 py-2 text-xs whitespace-nowrap text-gray-500">${val}</td>`;
                    });
                    html += `</tr>`;
                });
            }
        });
        html += `</tbody></table>`;
        container.innerHTML = html;
    }

    // --- Subpage 2: Trade Compare Logic ---
    function renderComparePage() {
        const userSkaterContainer = document.getElementById('roster-skater-table-container');
        const userGoalieContainer = document.getElementById('roster-goalie-table-container');
        const oppSkaterContainer = document.getElementById('opponent-skater-table-container');
        const oppGoalieContainer = document.getElementById('opponent-goalie-table-container');
        const rosterLoader = document.getElementById('roster-loading');
        const oppSkaterSection = document.getElementById('opponent-skater-section');
        const oppGoalieSection = document.getElementById('opponent-goalie-section');

        if (!userSkaterContainer) return;

        if (rosterData.players.length === 0) {
            if(rosterLoader) rosterLoader.textContent = "Loading rosters...";
            return;
        }
        if(rosterLoader) rosterLoader.textContent = "";

        // 1. Filter
        const userPlayers = rosterData.players.filter(p => p.fantasy_team_name === userTeamName);
        const oppPlayers = rosterData.players.filter(p => p.fantasy_team_name !== userTeamName && p.fantasy_team_name !== 'Free Agent');

        const userSkaters = userPlayers.filter(p => !(p.eligible_positions || '').includes('G'));
        const userGoalies = userPlayers.filter(p => (p.eligible_positions || '').includes('G'));
        const oppSkaters = oppPlayers.filter(p => !(p.eligible_positions || '').includes('G'));
        const oppGoalies = oppPlayers.filter(p => (p.eligible_positions || '').includes('G'));

        // 2. Hierarchical Sort
        const multiSortFn = (keys) => (a, b) => {
            if (!keys || keys.length === 0) return 0;
            for (let key of keys) {
                let rankKey = key + '_cat_rank';
                let rA = a[rankKey], rB = b[rankKey];
                if (rA == null || rA === 0) rA = 999;
                if (rB == null || rB === 0) rB = 999;
                if (rA !== rB) return rA - rB; // Return as soon as we find a difference
            }
            return 0;
        };

        userSkaters.sort(multiSortFn(activeFromCats));
        userGoalies.sort(multiSortFn(activeFromCats));
        oppSkaters.sort(multiSortFn(activeToCats));
        oppGoalies.sort(multiSortFn(activeToCats));

        // 3. Render
        renderRosterTable(userSkaterContainer, userSkaters, rosterData.skaterCategories, false);
        renderRosterTable(userGoalieContainer, userGoalies, rosterData.goalieCategories, false);
        renderRosterTable(oppSkaterContainer, oppSkaters, rosterData.skaterCategories, true);
        renderRosterTable(oppGoalieContainer, oppGoalies, rosterData.goalieCategories, true);

        // 4. Swap Sections (Context Swap)
        // Use the FIRST category in the "Trade To" list to determine context
        const primaryToCat = activeToCats[0];
        const isGoalieStat = primaryToCat && rosterData.goalieCategories.includes(primaryToCat);

        if (oppSkaterSection && oppGoalieSection) {
            if (isGoalieStat) {
                oppGoalieSection.style.order = 1;
                oppSkaterSection.style.order = 2;
            } else {
                oppSkaterSection.style.order = 1;
                oppGoalieSection.style.order = 2;
            }
        }
    }

    function renderRosterTable(container, players, categories, showTeamColumn) {
        if (!players || players.length === 0) { container.innerHTML = `<p class="text-gray-400 p-4">No players found.</p>`; return; }
        let html = `<div class="overflow-x-auto"><table class="min-w-full divide-y divide-gray-700 text-sm"><thead class="bg-gray-700/50"><tr>`;
        html += `<th class="px-2 py-1 text-left font-bold text-gray-300">Player</th>`;
        if (showTeamColumn) html += `<th class="px-2 py-1 text-left font-bold text-gray-300">Team</th>`;
        html += `<th class="px-2 py-1 text-left font-bold text-gray-300">NHL Team</th><th class="px-2 py-1 text-left font-bold text-gray-300">Pos</th>`;
        categories.forEach(cat => html += `<th class="px-2 py-1 text-center font-bold text-gray-300" title="${cat}">${cat}</th>`);
        html += `</tr></thead><tbody class="bg-gray-800 divide-y divide-gray-700">`;

        players.forEach(p => {
            html += `<tr class="hover:bg-gray-700/50">`;
            html += `<td class="px-2 py-1 whitespace-nowrap font-medium text-gray-300">${p.player_name}</td>`;
            if (showTeamColumn) html += `<td class="px-2 py-1 whitespace-nowrap text-yellow-300">${p.fantasy_team_name}</td>`;
            html += `<td class="px-2 py-1 whitespace-nowrap text-gray-300">${p.team}</td><td class="px-2 py-1 whitespace-nowrap text-gray-300">${p.eligible_positions}</td>`;
            categories.forEach(cat => {
                const rank = p[cat + '_cat_rank'];
                const display = (rank !== null && rank !== undefined) ? Math.round(rank) : '-';
                const color = getHeatmapColor(rank);
                html += `<td class="px-2 py-1 text-center font-semibold text-gray-600" style="background-color: ${color};">${display}</td>`;
            });
            html += `</tr>`;
        });
        html += `</tbody></table></div>`;
        container.innerHTML = html;
    }

    init().catch(e => console.error("Init failed", e));
})();
