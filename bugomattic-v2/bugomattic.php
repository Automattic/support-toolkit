<?php
/**
 * Plugin Name: Bugomattic
 * Description: View and search Linear issues from WordPress admin dashboard. Select teams, search issues, and filter by status.
 * Version: 1.0.0
 * Author: Zain
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: bugomattic
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'BUGOMATTIC_VERSION', '1.0.0' );
define( 'BUGOMATTIC_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'BUGOMATTIC_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

class Bugomattic {
	
	private static $instance = null;
	
	public static function get_instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}
	
	private function __construct() {
		add_action( 'admin_menu', array( $this, 'add_admin_menu' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_scripts' ) );
		add_action( 'wp_ajax_linear_get_teams', array( $this, 'ajax_get_teams' ) );
		add_action( 'wp_ajax_linear_get_states', array( $this, 'ajax_get_states' ) );
		add_action( 'wp_ajax_linear_search_issues', array( $this, 'ajax_search_issues' ) );
		add_action( 'admin_init', array( $this, 'register_settings' ) );
	}
	
	public function register_settings() {
		$args = array(
			'type' => 'string',
			'sanitize_callback' => 'sanitize_text_field',
			'default' => ''
		);
		register_setting( 'bugomattic_settings', 'linear_api_key', $args );
	}
	
	public function add_admin_menu() {
		add_menu_page(
			__( 'Bugomattic', 'bugomattic' ),
			__( 'Bugomattic', 'bugomattic' ),
			'manage_options',
			'bugomattic',
			array( $this, 'render_admin_page' ),
			'dashicons-list-view',
			30
		);
		
		add_submenu_page(
			'bugomattic',
			__( 'Settings', 'bugomattic' ),
			__( 'Settings', 'bugomattic' ),
			'manage_options',
			'bugomattic-settings',
			array( $this, 'render_settings_page' )
		);
	}
	
	public function enqueue_scripts( $hook ) {
		if ( 'toplevel_page_bugomattic' !== $hook && 'bugomattic_page_bugomattic-settings' !== $hook ) {
			return;
		}
		
		$css_url = BUGOMATTIC_PLUGIN_URL . 'assets/style.css';
		$js_url = BUGOMATTIC_PLUGIN_URL . 'assets/script.js';
		
		wp_enqueue_style(
			'bugomattic',
			$css_url,
			array(),
			BUGOMATTIC_VERSION
		);
		
		wp_enqueue_script(
			'bugomattic',
			$js_url,
			array( 'jquery' ),
			BUGOMATTIC_VERSION,
			true
		);
		
		wp_localize_script( 'bugomattic', 'bugomattic', array(
			'ajaxUrl' => admin_url( 'admin-ajax.php' ),
			'nonce' => wp_create_nonce( 'bugomattic_nonce' ),
			'strings' => array(
				'loading' => __( 'Loading...', 'bugomattic' ),
				'error' => __( 'An error occurred. Please try again.', 'bugomattic' ),
				'noResults' => __( 'No issues found.', 'bugomattic' ),
				'selectTeam' => __( 'Please select a team first.', 'bugomattic' )
			)
		) );
	}
	
	public function render_settings_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		
		if ( isset( $_POST['submit'] ) && check_admin_referer( 'bugomattic_settings' ) ) {
			$new_api_key = sanitize_text_field( $_POST['linear_api_key'] ?? '' );
			if ( ! empty( $new_api_key ) ) {
				update_option( 'linear_api_key', $new_api_key );
				echo '<div class="notice notice-success"><p>' . esc_html__( 'Settings saved.', 'bugomattic' ) . '</p></div>';
			} else {
				echo '<div class="notice notice-info"><p>' . esc_html__( 'No changes made. Leave blank to keep current API key, or enter a new key to update.', 'bugomattic' ) . '</p></div>';
			}
		}
		
		$api_key = get_option( 'linear_api_key', '' );
		$has_key = ! empty( $api_key );
		?>
		<div class="wrap">
			<h1><?php echo esc_html__( 'Bugomattic Settings', 'bugomattic' ); ?></h1>
			<form method="post" action="">
				<?php wp_nonce_field( 'bugomattic_settings' ); ?>
				<table class="form-table">
					<tr>
						<th scope="row">
							<label for="linear_api_key"><?php echo esc_html__( 'Linear API Key', 'bugomattic' ); ?></label>
						</th>
						<td>
							<input type="password" id="linear_api_key" name="linear_api_key" value="" class="regular-text" placeholder="<?php echo $has_key ? esc_attr__( '••••••••••••••••••••••••••••••••', 'bugomattic' ) : esc_attr__( 'Enter API key', 'bugomattic' ); ?>" />
							<?php if ( $has_key ) : ?>
								<p class="description" style="color: #00a32a;">
									<?php echo esc_html__( 'API key is configured. Leave blank to keep current key, or enter a new key to update.', 'bugomattic' ); ?>
								</p>
							<?php else : ?>
								<p class="description"><?php echo esc_html__( 'Enter your Linear API key. You can generate one from Linear Settings > API.', 'bugomattic' ); ?></p>
							<?php endif; ?>
						</td>
					</tr>
				</table>
				<?php submit_button(); ?>
			</form>
		</div>
		<?php
	}
	
	public function render_admin_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		
		$api_key = get_option( 'linear_api_key', '' );
		if ( empty( $api_key ) ) {
			echo '<div class="notice notice-warning"><p>';
			printf(
				esc_html__( 'Please configure your Linear API key in %s.', 'bugomattic' ),
				'<a href="' . esc_url( admin_url( 'admin.php?page=bugomattic-settings' ) ) . '">' . esc_html__( 'Settings', 'bugomattic' ) . '</a>'
			);
			echo '</p></div>';
		}
		?>
		<div class="wrap">
			<h1><?php echo esc_html__( 'Bugomattic', 'bugomattic' ); ?></h1>
			
			<div class="linear-issues-viewer-container">
				<div class="linear-filters">
					<div class="filter-group">
						<label for="linear-team-select"><?php echo esc_html__( 'Product (Team):', 'bugomattic' ); ?></label>
						<div class="linear-team-wrapper">
							<input type="text" id="linear-team-input" class="linear-input" placeholder="<?php echo esc_attr__( 'Type to search teams...', 'bugomattic' ); ?>" autocomplete="off" />
							<select id="linear-team-select" class="linear-select" style="display: none;">
								<option value=""><?php echo esc_html__( 'Select a team...', 'bugomattic' ); ?></option>
							</select>
							<div id="linear-team-dropdown" class="linear-team-dropdown"></div>
						</div>
					</div>
					
					<div class="filter-group">
						<label for="linear-status-select"><?php echo esc_html__( 'Status:', 'bugomattic' ); ?></label>
						<select id="linear-status-select" class="linear-select" disabled>
							<option value=""><?php echo esc_html__( 'All statuses', 'bugomattic' ); ?></option>
						</select>
					</div>
					
					<div class="filter-group">
						<label for="linear-search-input"><?php echo esc_html__( 'Search:', 'bugomattic' ); ?></label>
						<input type="text" id="linear-search-input" class="linear-input" placeholder="<?php echo esc_attr__( 'Search issues...', 'bugomattic' ); ?>" />
					</div>
					
					<div class="filter-group">
						<button type="button" id="linear-search-btn" class="button button-primary"><?php echo esc_html__( 'Search', 'bugomattic' ); ?></button>
						<button type="button" id="linear-reset-btn" class="button"><?php echo esc_html__( 'Reset', 'bugomattic' ); ?></button>
					</div>
				</div>
				
				<div id="linear-loading" class="linear-loading" style="display: none;">
					<p><?php echo esc_html__( 'Loading...', 'bugomattic' ); ?></p>
				</div>
				
				<div id="linear-results" class="linear-results"></div>
			</div>
		</div>
		<?php
	}
	
	private function get_api_key() {
		return get_option( 'linear_api_key', '' );
	}
	
	private function make_graphql_request( $query, $variables = array() ) {
		$api_key = $this->get_api_key();
		if ( empty( $api_key ) ) {
			return new WP_Error( 'no_api_key', __( 'Linear API key is not configured.', 'bugomattic' ) );
		}
		
		$body = array( 'query' => $query );
		if ( ! empty( $variables ) ) {
			$body['variables'] = $variables;
		}
		
		$response = wp_remote_post( 'https://api.linear.app/graphql', array(
			'headers' => array(
				'Content-Type' => 'application/json',
				'Authorization' => $api_key,
			),
			'body' => json_encode( $body ),
			'timeout' => 30,
		) );
		
		if ( is_wp_error( $response ) ) {
			return $response;
		}
		
		$body = wp_remote_retrieve_body( $response );
		$data = json_decode( $body, true );
		
		if ( isset( $data['errors'] ) ) {
			return new WP_Error( 'graphql_error', $data['errors'][0]['message'] ?? __( 'GraphQL error occurred.', 'bugomattic' ) );
		}
		
		return $data['data'] ?? null;
	}
	
	public function ajax_get_teams() {
		check_ajax_referer( 'bugomattic_nonce', 'nonce' );
		
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Unauthorized.', 'bugomattic' ) ) );
		}
		
		$all_teams = array();
		$has_next_page = true;
		$cursor = null;
		
		while ( $has_next_page ) {
			$query = 'query($after: String) { teams(first: 200, after: $after) { nodes { id key name } pageInfo { hasNextPage endCursor } } }';
			$variables = array();
			if ( $cursor ) {
				$variables['after'] = $cursor;
			}
			
			$data = $this->make_graphql_request( $query, $variables );
			
			if ( is_wp_error( $data ) ) {
				wp_send_json_error( array( 'message' => $data->get_error_message() ) );
			}
			
			$teams = $data['teams']['nodes'] ?? array();
			$all_teams = array_merge( $all_teams, $teams );
			
			$page_info = $data['teams']['pageInfo'] ?? array();
			$has_next_page = $page_info['hasNextPage'] ?? false;
			$cursor = $page_info['endCursor'] ?? null;
			
			if ( empty( $teams ) ) {
				break;
			}
		}
		
		wp_send_json_success( $all_teams );
	}
	
	public function ajax_get_states() {
		check_ajax_referer( 'bugomattic_nonce', 'nonce' );
		
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Unauthorized.', 'bugomattic' ) ) );
		}
		
		$team_key = sanitize_text_field( $_POST['team_key'] ?? '' );
		if ( empty( $team_key ) ) {
			wp_send_json_error( array( 'message' => __( 'Team key is required.', 'bugomattic' ) ) );
		}
		
		$query = 'query($teamKey: String!) { workflowStates(filter: { team: { key: { eq: $teamKey } } }) { nodes { id name type } } }';
		$variables = array( 'teamKey' => $team_key );
		$data = $this->make_graphql_request( $query, $variables );
		
		if ( is_wp_error( $data ) ) {
			wp_send_json_error( array( 'message' => $data->get_error_message() ) );
		}
		
		wp_send_json_success( $data['workflowStates']['nodes'] ?? array() );
	}
	
	public function ajax_search_issues() {
		check_ajax_referer( 'bugomattic_nonce', 'nonce' );
		
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Unauthorized.', 'bugomattic' ) ) );
		}
		
		$team_key = sanitize_text_field( $_POST['team_key'] ?? '' );
		$search = sanitize_text_field( $_POST['search'] ?? '' );
		$state_id = sanitize_text_field( $_POST['state_id'] ?? '' );
		
		if ( empty( $team_key ) ) {
			wp_send_json_error( array( 'message' => __( 'Team key is required.', 'bugomattic' ) ) );
		}
		
		$variables = array( 'teamKey' => $team_key );
		$filter_parts = array( 'team: { key: { eq: $teamKey } }' );
		
		if ( ! empty( $state_id ) ) {
			$variables['stateId'] = $state_id;
			$filter_parts[] = 'state: { id: { eq: $stateId } }';
		}
		
		// Use GraphQL's 'or' operator to search across title and description (server-side filtering)
		// Identifier is not filterable in GraphQL, so we'll check it in PHP if needed
		if ( ! empty( $search ) ) {
			$variables['search'] = $search;
			$filter_parts[] = 'or: [ { title: { containsIgnoreCase: $search } }, { description: { containsIgnoreCase: $search } } ]';
		}
		
		$filter_string = '{ ' . implode( ', ', $filter_parts ) . ' }';
		
		$query = 'query($teamKey: String!' . ( ! empty( $state_id ) ? ', $stateId: ID!' : '' ) . ( ! empty( $search ) ? ', $search: String!' : '' ) . ') { issues(filter: ' . $filter_string . ', first: 100, orderBy: updatedAt) { nodes { id identifier title description assignee { name email } state { id name type } priority priorityLabel updatedAt createdAt url } } }';
		
		$data = $this->make_graphql_request( $query, $variables );
		
		if ( is_wp_error( $data ) ) {
			wp_send_json_error( array( 'message' => $data->get_error_message() ) );
		}
		
		$issues = $data['issues']['nodes'] ?? array();
		
		// GraphQL's 'or' filter already handled searching in title and description
		// Note: Identifier is not filterable in GraphQL, so identifier-only searches
		// won't be found. Users can search by identifier in the title/description if needed.
		
		wp_send_json_success( $issues );
	}
}

Bugomattic::get_instance();

