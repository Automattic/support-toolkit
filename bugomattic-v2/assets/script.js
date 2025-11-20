(function($) {
	'use strict';
	
	let currentTeamKey = '';
	let currentStates = [];
	let allTeams = [];
	let selectedTeam = null;
	
	$(document).ready(function() {
		loadTeams();
		
		$('#linear-team-input').on('input', function() {
			const searchTerm = $(this).val().toLowerCase();
			if (allTeams.length > 0) {
				filterTeams(searchTerm);
			} else {
				setTimeout(function() {
					if (allTeams.length > 0) {
						filterTeams(searchTerm);
					}
				}, 500);
			}
		});
		
		$('#linear-team-input').on('focus', function() {
			if (allTeams.length === 0) {
				return;
			}
			const val = $(this).val();
			// If it looks like a selected team (has parentheses), clear it for new search
			if (val && val.indexOf('(') > -1 && val.indexOf(')') > -1) {
				$(this).val('');
				currentTeamKey = '';
				showAllTeams();
			} else if (val) {
				filterTeams(val.toLowerCase());
			} else {
				showAllTeams();
			}
		});
		
		$('#linear-team-input').on('keydown', function(e) {
			if (e.key === 'Escape') {
				$('#linear-team-dropdown').removeClass('show');
			}
		});
		
		$(document).on('click', '.linear-team-item', function() {
			const teamKey = $(this).data('key');
			const teamName = $(this).data('name');
			selectTeam(teamKey, teamName);
		});
		
		$(document).on('click', function(e) {
			if (!$(e.target).closest('.linear-team-wrapper').length && 
			    !$(e.target).hasClass('linear-team-item')) {
				const dropdown = $('#linear-team-dropdown');
				dropdown.removeClass('show');
				dropdown.css('display', 'none');
			}
		});
		
		$('#linear-team-select').on('change', function() {
			const teamKey = $(this).val();
			currentTeamKey = teamKey;
			
			if (teamKey) {
				loadStates(teamKey);
				$('#linear-status-select').prop('disabled', false);
			} else {
				$('#linear-status-select').prop('disabled', true).html('<option value="">All statuses</option>');
				currentStates = [];
			}
			
			clearResults();
		});
		
		$('#linear-search-btn').on('click', function() {
			searchIssues();
		});
		
		$('#linear-search-input').on('keypress', function(e) {
			if (e.which === 13) {
				searchIssues();
			}
		});
		
		$('#linear-reset-btn').on('click', function() {
			resetFilters();
		});
	});
	
	function loadTeams() {
		$.ajax({
			url: bugomattic.ajaxUrl,
			type: 'POST',
			data: {
				action: 'linear_get_teams',
				nonce: bugomattic.nonce
			},
			success: function(response) {
				if (response.success && response.data) {
					allTeams = response.data;
					
					const select = $('#linear-team-select');
					select.append('<option value="">Select a team...</option>');
					
					allTeams.forEach(function(team) {
						select.append(
							$('<option></option>')
								.attr('value', team.key)
								.text(team.name + ' (' + team.key + ')')
						);
					});
				} else {
					showError(response.data?.message || bugomattic.strings.error);
				}
			},
			error: function() {
				showError(bugomattic.strings.error);
			}
		});
	}
	
	function showAllTeams() {
		displayTeamDropdown(allTeams.slice(0, 50));
	}
	
	function filterTeams(searchTerm) {
		if (!searchTerm) {
			showAllTeams();
			return;
		}
		
		const filtered = allTeams.filter(function(team) {
			return team.name.toLowerCase().includes(searchTerm) || 
			       team.key.toLowerCase().includes(searchTerm);
		});
		
		displayTeamDropdown(filtered.slice(0, 50));
	}
	
	function displayTeamDropdown(teams) {
		const dropdown = $('#linear-team-dropdown');
		if (dropdown.length === 0) {
			return;
		}
		
		dropdown.empty();
		
		if (!teams || teams.length === 0) {
			dropdown.html('<div class="linear-team-item">No teams found</div>');
			dropdown.addClass('show');
			dropdown.css({
				'display': 'block',
				'position': 'absolute',
				'top': '100%',
				'left': '0',
				'right': '0'
			});
			return;
		}
		
		teams.forEach(function(team) {
			const item = $('<div class="linear-team-item"></div>')
				.data('key', team.key)
				.data('name', team.name)
				.html('<span class="team-key">[' + escapeHtml(team.key) + ']</span> <span class="team-name">' + escapeHtml(team.name) + '</span>');
			
			if (team.key === currentTeamKey) {
				item.addClass('selected');
			}
			
			dropdown.append(item);
		});
		
		dropdown.addClass('show');
		dropdown.css({
			'display': 'block',
			'position': 'absolute',
			'top': '100%',
			'left': '0',
			'right': '0',
			'z-index': '99999',
			'background': '#ffffff',
			'background-color': '#ffffff'
		});
	}
	
	function selectTeam(teamKey, teamName) {
		currentTeamKey = teamKey;
		selectedTeam = { key: teamKey, name: teamName };
		
		$('#linear-team-input').val(teamName + ' (' + teamKey + ')');
		$('#linear-team-select').val(teamKey);
		
		// Hide the dropdown
		const dropdown = $('#linear-team-dropdown');
		dropdown.removeClass('show');
		dropdown.css({
			'display': 'none'
		});
		
		if (teamKey) {
			loadStates(teamKey);
			$('#linear-status-select').prop('disabled', false);
		} else {
			$('#linear-status-select').prop('disabled', true).html('<option value="">All statuses</option>');
			currentStates = [];
		}
		
		clearResults();
	}
	
	function loadStates(teamKey) {
		$('#linear-status-select').html('<option value="">Loading...</option>');
		
		$.ajax({
			url: bugomattic.ajaxUrl,
			type: 'POST',
			data: {
				action: 'linear_get_states',
				nonce: bugomattic.nonce,
				team_key: teamKey
			},
			success: function(response) {
				if (response.success && response.data) {
					currentStates = response.data;
					const select = $('#linear-status-select');
					select.html('<option value="">All statuses</option>');
					
					response.data.forEach(function(state) {
						select.append(
							$('<option></option>')
								.attr('value', state.id)
								.text(state.name)
						);
					});
				} else {
					showError(response.data?.message || bugomattic.strings.error);
					$('#linear-status-select').html('<option value="">All statuses</option>');
				}
			},
			error: function() {
				showError(bugomattic.strings.error);
				$('#linear-status-select').html('<option value="">All statuses</option>');
			}
		});
	}
	
	function searchIssues() {
		if (!currentTeamKey) {
			alert(bugomattic.strings.selectTeam);
			return;
		}
		
		const search = $('#linear-search-input').val();
		const stateId = $('#linear-status-select').val();
		
		$('#linear-loading').show();
		$('#linear-results').hide();
		
		$.ajax({
			url: bugomattic.ajaxUrl,
			type: 'POST',
			data: {
				action: 'linear_search_issues',
				nonce: bugomattic.nonce,
				team_key: currentTeamKey,
				search: search,
				state_id: stateId
			},
			success: function(response) {
				$('#linear-loading').hide();
				
				if (response.success && response.data) {
					displayIssues(response.data);
				} else {
					showError(response.data?.message || bugomattic.strings.error);
				}
			},
			error: function() {
				$('#linear-loading').hide();
				showError(bugomattic.strings.error);
			}
		});
	}
	
	function displayIssues(issues) {
		const resultsDiv = $('#linear-results');
		resultsDiv.empty();
		
		if (issues.length === 0) {
			resultsDiv.html('<div class="linear-no-results">' + bugomattic.strings.noResults + '</div>');
			resultsDiv.show();
			return;
		}
		
		let table = '<table class="linear-issues-table"><thead><tr>';
		table += '<th>ID</th>';
		table += '<th>Title</th>';
		table += '<th>Status</th>';
		table += '<th>Priority</th>';
		table += '<th>Assignee</th>';
		table += '<th>Updated</th>';
		table += '</tr></thead><tbody>';
		
		issues.forEach(function(issue) {
			const statusClass = getStatusClass(issue.state?.type || '');
			const priorityClass = getPriorityClass(issue.priority || 4);
			const assigneeName = issue.assignee?.name || 'Unassigned';
			const updatedDate = formatDate(issue.updatedAt);
			
			table += '<tr>';
			table += '<td><a href="' + escapeHtml(issue.url || '#') + '" target="_blank" class="linear-issue-identifier">' + escapeHtml(issue.identifier || '') + '</a></td>';
			table += '<td>';
			table += '<div class="linear-issue-title">' + escapeHtml(issue.title || '') + '</div>';
			if (issue.description) {
				const description = stripHtml(issue.description).substring(0, 150);
				table += '<div class="linear-issue-description">' + escapeHtml(description) + (issue.description.length > 150 ? '...' : '') + '</div>';
			}
			table += '</td>';
			table += '<td><span class="linear-status-badge linear-status-' + statusClass + '">' + escapeHtml(issue.state?.name || '') + '</span></td>';
			table += '<td><span class="linear-priority-badge linear-priority-' + priorityClass + '">' + escapeHtml(issue.priorityLabel || 'No priority') + '</span></td>';
			table += '<td>' + escapeHtml(assigneeName) + '</td>';
			table += '<td>' + escapeHtml(updatedDate) + '</td>';
			table += '</tr>';
		});
		
		table += '</tbody></table>';
		resultsDiv.html(table);
		resultsDiv.show();
	}
	
	function getStatusClass(type) {
		const map = {
			'started': 'started',
			'unstarted': 'unstarted',
			'backlog': 'backlog',
			'completed': 'completed',
			'canceled': 'canceled',
			'triage': 'triage'
		};
		return map[type] || 'unstarted';
	}
	
	function getPriorityClass(priority) {
		if (priority === 0) return 'urgent';
		if (priority === 1) return 'high';
		if (priority === 2) return 'high';
		if (priority === 3) return 'medium';
		return 'low';
	}
	
	function formatDate(dateString) {
		if (!dateString) return '';
		const date = new Date(dateString);
		return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
	}
	
	function stripHtml(html) {
		const tmp = document.createElement('DIV');
		tmp.innerHTML = html;
		return tmp.textContent || tmp.innerText || '';
	}
	
	function escapeHtml(text) {
		const map = {
			'&': '&amp;',
			'<': '&lt;',
			'>': '&gt;',
			'"': '&quot;',
			"'": '&#039;'
		};
		return text ? text.replace(/[&<>"']/g, function(m) { return map[m]; }) : '';
	}
	
	function showError(message) {
		$('#linear-results').html('<div class="linear-error">' + escapeHtml(message) + '</div>').show();
	}
	
	function clearResults() {
		$('#linear-results').empty().hide();
	}
	
	function resetFilters() {
		$('#linear-team-input').val('');
		$('#linear-team-select').val('');
		$('#linear-status-select').val('').prop('disabled', true).html('<option value="">All statuses</option>');
		$('#linear-search-input').val('');
		const dropdown = $('#linear-team-dropdown');
		dropdown.removeClass('show');
		dropdown.css('display', 'none');
		currentTeamKey = '';
		currentStates = [];
		selectedTeam = null;
		clearResults();
	}
	
})(jQuery);

