#!/usr/bin/env bash

set -e
set -u

KEYCLOAK_BASE_URL=$KEYCLOAK_BASE_URL
KEYCLOAK_ADMIN_USER=$KEYCLOAK_ADMIN_USER
KEYCLOAK_ADMIN_PASSWORD=$KEYCLOAK_ADMIN_PASSWORD
REALM_NAME=$REALM_NAME
PRISM_AGENT_CLIENT_SECRET=$PRISM_AGENT_CLIENT_SECRET
PORTAL_CLIENT_SECRET=$PORTAL_CLIENT_SECRET
# Public base URL of the portal (browser perspective) used for redirect/CORS/logout.
PORTAL_BASE_URL=${PORTAL_BASE_URL:-http://localhost:3000}

# Optional social login credentials. When an id+secret pair is present the
# matching Keycloak identity provider is configured. Defaults keep `set -u` happy.
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET:-}
GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID:-}
GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET:-}

function get_admin_token() {
	local response
	response=$(
		curl --request POST "$KEYCLOAK_BASE_URL/realms/master/protocol/openid-connect/token" \
			--fail -s \
			-d "grant_type=password" \
			-d "client_id=admin-cli" \
			-d "username=$KEYCLOAK_ADMIN_USER" \
			-d "password=$KEYCLOAK_ADMIN_PASSWORD"
	)
	local access_token
	access_token=$(echo "$response" | jq -r '.access_token')
	echo $access_token
}

function create_realm() {
	local access_token=$1

	curl --request POST "$KEYCLOAK_BASE_URL/admin/realms" \
		--fail -s \
		-H "Authorization: Bearer $access_token" \
		-H "Content-Type: application/json" \
		--data-raw "{
			\"realm\": \"$REALM_NAME\",
			\"enabled\": true,
			\"bruteForceProtected\": true,
			\"permanentLockout\": false,
			\"failureFactor\": 5,
			\"waitIncrementSeconds\": 60,
			\"maxFailureWaitSeconds\": 900,
			\"minimumQuickLoginWaitSeconds\": 60,
			\"quickLoginCheckMilliSeconds\": 1000,
			\"maxDeltaTimeSeconds\": 43200,
			\"eventsEnabled\": true,
			\"adminEventsEnabled\": true
		}"
}

function create_client() {
	local access_token=$1
	local client_id=$2
	local client_secret=$3

	curl --request POST "$KEYCLOAK_BASE_URL/admin/realms/$REALM_NAME/clients" \
		--fail -s \
		-H "Authorization: Bearer $access_token" \
		-H "Content-Type: application/json" \
		--data-raw "{
			\"id\": \"$client_id\",
			\"directAccessGrantsEnabled\": true,
			\"authorizationServicesEnabled\": true,
			\"serviceAccountsEnabled\": true,
			\"secret\": \"$client_secret\"
		}"
}

function create_web_client() {
	local access_token=$1
	local client_id=$2
	local client_secret=$3
	local base_url=$4

	curl --request POST "$KEYCLOAK_BASE_URL/admin/realms/$REALM_NAME/clients" \
		--fail -s \
		-H "Authorization: Bearer $access_token" \
		-H "Content-Type: application/json" \
		--data-raw "{
			\"clientId\": \"$client_id\",
			\"enabled\": true,
			\"protocol\": \"openid-connect\",
			\"publicClient\": false,
			\"standardFlowEnabled\": true,
			\"directAccessGrantsEnabled\": true,
			\"serviceAccountsEnabled\": false,
			\"secret\": \"$client_secret\",
			\"redirectUris\": [\"$base_url/auth/callback\", \"$base_url/callback\"],
			\"webOrigins\": [\"$base_url\"],
			\"attributes\": {
				\"post.logout.redirect.uris\": \"$base_url##$base_url/*\"
			}
		}"
}

# Configures a social identity provider (e.g. Google, GitHub). Pass an empty
# default_scope to omit it. The alias is used as the kc_idp_hint by the portal.
function create_identity_provider() {
	local access_token=$1
	local alias=$2
	local provider_id=$3
	local client_id=$4
	local client_secret=$5
	local default_scope=$6

	local config="{\"clientId\": \"$client_id\", \"clientSecret\": \"$client_secret\", \"syncMode\": \"IMPORT\""
	if [ -n "$default_scope" ]; then
		config="$config, \"defaultScope\": \"$default_scope\""
	fi
	config="$config}"

	curl --request POST "$KEYCLOAK_BASE_URL/admin/realms/$REALM_NAME/identity-provider/instances" \
		--fail -s \
		-H "Authorization: Bearer $access_token" \
		-H "Content-Type: application/json" \
		--data-raw "{
			\"alias\": \"$alias\",
			\"providerId\": \"$provider_id\",
			\"enabled\": true,
			\"trustEmail\": true,
			\"storeToken\": false,
			\"config\": $config
		}"
}

function create_user() {
	local access_token=$1
	local username=$2
	local password=$3

	curl --request POST "$KEYCLOAK_BASE_URL/admin/realms/$REALM_NAME/users" \
		--fail -s \
		-H "Authorization: Bearer $access_token" \
		-H "Content-Type: application/json" \
		--data-raw "{
			\"id\": \"$username\",
			\"username\": \"$username\",
			\"firstName\": \"$username\",
			\"enabled\": true,
			\"credentials\": [{\"value\": \"$password\", \"temporary\": false}]
		}"
}

echo "Getting admin access token ..."
ADMIN_ACCESS_TOKEN=$(get_admin_token)

echo "Creating a new test realm ..."
create_realm $ADMIN_ACCESS_TOKEN

echo "Creating a new prism-agent client ..."
create_client $ADMIN_ACCESS_TOKEN "prism-agent" $PRISM_AGENT_CLIENT_SECRET

echo "Creating the identity-portal web client ..."
create_web_client $ADMIN_ACCESS_TOKEN "identity-portal" $PORTAL_CLIENT_SECRET "$PORTAL_BASE_URL"

echo "Creating a new sample user ..."
create_user $ADMIN_ACCESS_TOKEN "alice" "1234"

echo "Creating a new sample user ..."
create_user $ADMIN_ACCESS_TOKEN "bob" "1234"

if [ -n "$GOOGLE_CLIENT_ID" ] && [ -n "$GOOGLE_CLIENT_SECRET" ]; then
	echo "Configuring Google identity provider ..."
	create_identity_provider "$ADMIN_ACCESS_TOKEN" "google" "google" "$GOOGLE_CLIENT_ID" "$GOOGLE_CLIENT_SECRET" "openid profile email"
else
	echo "Skipping Google identity provider (GOOGLE_CLIENT_ID/SECRET not set)."
fi

if [ -n "$GITHUB_CLIENT_ID" ] && [ -n "$GITHUB_CLIENT_SECRET" ]; then
	echo "Configuring GitHub identity provider ..."
	create_identity_provider "$ADMIN_ACCESS_TOKEN" "github" "github" "$GITHUB_CLIENT_ID" "$GITHUB_CLIENT_SECRET" ""
else
	echo "Skipping GitHub identity provider (GITHUB_CLIENT_ID/SECRET not set)."
fi