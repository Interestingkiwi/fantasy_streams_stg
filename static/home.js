document.addEventListener('DOMContentLoaded', () => {
    const logoutButton = document.getElementById('logout-button');
    const timestampText = document.getElementById('timestamp-text');
    const dropdownContainer = document.getElementById('dropdown-container');
    const showRawCheckbox = document.getElementById('global-show-raw-data');

    if (showRawCheckbox) {
        // Init state
        const isRaw = localStorage.getItem('showRawData') === 'true';
        showRawCheckbox.checked = isRaw;

        showRawCheckbox.addEventListener('change', (e) => {
            const val = e.target.checked;
            localStorage.setItem('showRawData', val);
            // Notify all other scripts
            window.dispatchEvent(new CustomEvent('rawDataToggled', { detail: { showRaw: val } }));
        });
    }
    const modal = document.getElementById('global-cat-rank-modal');
    const closeBtn = document.getElementById('global-modal-close');
    const modalContent = document.getElementById('global-modal-content');
    const modalTitle = document.getElementById('global-modal-title');

    if (closeBtn && modal) {
        closeBtn.onclick = () => modal.classList.add('hidden');
        modal.onclick = (e) => { if (e.target === modal) modal.classList.add('hidden'); };
    }

    // Global function to open modal
    window.openCatRankModal = function(playerObj, categories) {
        if (!modal || !modalContent) return;

        const showingRawMain = localStorage.getItem('showRawData') === 'true';
        // If main view is Raw, modal shows Ranks. If main is Ranks, modal shows Raw.
        const showRanksInModal = showingRawMain;

        modalTitle.textContent = `${playerObj.player_name || 'Player'} - ${showRanksInModal ? 'Category Ranks' : 'Raw Stats'}`;

        let html = `<table class="w-full text-sm text-left text-gray-300">
            <thead class="text-xs text-gray-400 uppercase bg-gray-700"><tr><th class="px-3 py-2">Category</th><th class="px-3 py-2 text-right">${showRanksInModal ? 'Rank' : 'Value'}</th></tr></thead>
            <tbody class="divide-y divide-gray-700">`;

        categories.forEach(cat => {
            let displayVal = '-';
            let style = '';

            if (showRanksInModal) {
                const rank = playerObj[cat + '_cat_rank'];
                displayVal = (rank != null) ? Math.round(rank) : '-';
                // Use the existing getHeatmapColor if accessible, or inline logic
                // (Assuming getHeatmapColor is available or we replicate simple logic here)
                if (rank && rank <= 5) style = 'color: #4ade80; font-weight: bold;'; // Green
                else if (rank && rank >= 15) style = 'color: #f87171;'; // Red
            } else {
                const raw = playerObj[cat];
                displayVal = (raw != null && !isNaN(raw)) ? parseFloat(raw).toFixed(2).replace(/[.,]00$/, "") : (raw || '-');
            }

            html += `<tr><td class="px-3 py-2 font-medium">${cat}</td><td class="px-3 py-2 text-right" style="${style}">${displayVal}</td></tr>`;
        });

        html += `</tbody></table>`;
        modalContent.innerHTML = html;
        modal.classList.remove('hidden');
    };
});
    let pageData = null; // To store weeks, teams, etc.

    async function handleLogout() {
        // Redirect to logout endpoint, which will clear the session
        window.location.href = '/logout';
    }

    async function getTimestamp() {
        try {
            const response = await fetch('/api/db_timestamp');
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to fetch timestamp.');
            }

            if (data.timestamp) {
/* timestampText.textContent = `League data was last pulled from Yahoo at ${data.timestamp}`; */
                timestampText.textContent = `League data exists, check League Database tab for last update`;
            } else {
                timestampText.textContent = 'League data has not been updated yet. Please visit the League Database page.';
            }
        } catch (error) {
            console.error('Error setting timestamp:', error);
            timestampText.textContent = 'Error loading league data status.';
        }
    }

    async function initDropdowns() {
        try {
            const response = await fetch('/api/matchup_page_data');
            const data = await response.json();

            if (!response.ok || !data.db_exists) {
                // If DB doesn't exist, show a button to retry
                dropdownContainer.innerHTML = `<button id="reload-dropdowns" class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">Create DB then press to load</button>`;
                document.getElementById('reload-dropdowns').addEventListener('click', initDropdowns);
                return; // Stop further execution
            }

            // If DB exists, show and populate dropdowns with titles and side-by-side layout
            // --- NEW: Added Stat Sourcing Dropdown HTML ---
            dropdownContainer.innerHTML = `
                <div class="flex items-center gap-2">
                    <label for="week-select" class="text-sm font-medium text-gray-300">Fantasy Week:</label>
                    <select id="week-select" class="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5">
                        <option selected>Choose a week</option>
                    </select>
                </div>
                <div class="flex items-center gap-2">
                    <label for="your-team-select" class="text-sm font-medium text-gray-300">Your Team:</label>
                    <select id="your-team-select" class="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5">
                        <option selected>Choose your team</option>
                    </select>
                </div>
                <div class="flex items-center gap-2">
                    <label for="stat-sourcing-select" class="text-sm font-medium text-gray-300">Stat Sourcing:</label>
                    <select id="stat-sourcing-select" class="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5">
                        </select>
                </div>
            `;
            // Add the flex class back to the container itself
            dropdownContainer.classList.add('flex', 'items-center', 'gap-4');


            pageData = data;
            populateDropdowns();

            // --- NEW: Call function to populate the new dropdown ---
            populateStatSourcingDropdown();

            // Re-add event listeners after recreating the dropdowns
            document.getElementById('week-select').addEventListener('change', (e) => {
                localStorage.setItem('selectedWeek', e.target.value);
            });
            document.getElementById('your-team-select').addEventListener('change', (e) => {
                localStorage.setItem('selectedTeam', e.target.value);
            });

            // --- NEW: Add event listener for the new dropdown ---
            document.getElementById('stat-sourcing-select').addEventListener('change', (e) => {
                localStorage.setItem('selectedStatSourcing', e.target.value);

                // --- MODIFIED: Smart Refresh Logic ---
                // 1. Check if we are on the Free Agents page by looking for its unique button
                const recalculateBtn = document.getElementById('recalculate-button');

                if (recalculateBtn) {
                    // We are on Free Agents.
                    // Click the recalculate button to fetch new data WITHOUT reloading the page logic.
                    // This preserves the `simulatedMoves` variable in free-agents.js memory.
                    recalculateBtn.click();
                } else {
                    // We are on any other page.
                    // Find the active tab (the one with the blue background class) and click it to reload the page fragment.
                    const activeTab = document.querySelector('.toggle-btn.bg-blue-600');
                    if (activeTab) {
                        activeTab.click();
                    }
                }
            });

        } catch (error) {
            console.error('Initialization error for dropdowns:', error.message);
        }
    }

    function populateDropdowns() {
        const weekSelect = document.getElementById('week-select');
        const yourTeamSelect = document.getElementById('your-team-select');

        // Populate Weeks
        weekSelect.innerHTML = pageData.weeks.map(week =>
            `<option value="${week.week_num}">
                Week ${week.week_num} (${week.start_date} to ${week.end_date})
            </option>`
        ).join('');

        // Populate Teams
        const teamOptions = pageData.teams.map(team =>
            `<option value="${team.name}">${team.name}</option>`
        ).join('');
        yourTeamSelect.innerHTML = teamOptions;

        // Restore team selection from localStorage
        const savedTeam = localStorage.getItem('selectedTeam');
        if (savedTeam) {
            yourTeamSelect.value = savedTeam;
        }

        // Check if a session has started to handle the week selection
        if (!sessionStorage.getItem('fantasySessionStarted')) {
            // This is a new session. Default to the current week.
            const currentWeek = pageData.current_week;
            weekSelect.value = currentWeek;
            // Save it to localStorage so it persists during navigation
            localStorage.setItem('selectedWeek', currentWeek);
            // Mark the session as started
            sessionStorage.setItem('fantasySessionStarted', 'true');
        } else {
            // A session is active. Restore the last selected week from localStorage.
            const savedWeek = localStorage.getItem('selectedWeek');
            if (savedWeek) {
                weekSelect.value = savedWeek;
            } else {
                 // As a fallback, use the current week if nothing is in localStorage
                weekSelect.value = pageData.current_week;
            }
        }
    }

    // --- NEW: Function to populate the stat sourcing dropdown ---
    function populateStatSourcingDropdown() {
        const statSourcingSelect = document.getElementById('stat-sourcing-select');
        if (!statSourcingSelect) return; // Safety check

        const options = [
            { value: 'projected', text: 'Projected ROS' },
            { value: 'todate', text: 'Season To Date' },
            { value: 'combined', text: 'Combined' }
        ];

        let sourcingOptions = '';
        options.forEach(opt => {
            sourcingOptions += `<option value="${opt.value}">${opt.text}</option>`;
        });
        statSourcingSelect.innerHTML = sourcingOptions;

        // Restore selection from localStorage or set default
        const savedStatSourcing = localStorage.getItem('selectedStatSourcing');
        if (savedStatSourcing && options.some(o => o.value === savedStatSourcing)) {
            statSourcingSelect.value = savedStatSourcing;
        } else {
            // Default to 'projected' if nothing is saved or value is invalid
            statSourcingSelect.value = 'projected';
            localStorage.setItem('selectedStatSourcing', 'projected');
        }
    }

    if(logoutButton) {
        logoutButton.addEventListener('click', handleLogout);
    }

    if(timestampText) {
        getTimestamp();
    }

    // Initialize the dropdowns on page load
    initDropdowns();
});
