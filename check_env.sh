#!/bin/sh

# The file we are checking
ENV_FILE="${ENV_FILE:-.env}"

# List only the CRITICAL variables you want to ensure are filled
REQUIRED_VARS="NODE_ENV ENV_MODE HOST HOST_IP GATEWAY_PORT AUTH_PORT USER_PORT MATCHMAKING_PORT CHAT_PORT FRONTEND_PORT JWT_SECRET JWT_CHALLENGE_SECRET JWT_EXPIRES_IN REFRESH_TOKEN_EXPIRES_IN SERVICE_TOKEN INTERNAL_SERVICE_SECRET AUTH_SERVICE_URL USER_SERVICE_URL MATCHMAKING_SERVICE_URL CHAT_SERVICE_URL DB_USER_SERVICE_PATH DB_MATCHMAKING_SERVICE_PATH SQLITE_MATCHMAKING_DB_PATH FRONTEND_URL ALLOWED_ORIGINS COOKIE_SECRET AUTH_SERVICE_HOST USER_SERVICE_HOST MATCHMAKING_SERVICE_HOST CHAT_SERVICE_HOST GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET GOOGLE_REDIRECT_URI JWT_REFRESH_SECRET FORTYTWO_CLIENT_ID FORTYTWO_CLIENT_SECRET FORTYTWO_REDIRECT_URI"
PRESENT_VARS="VITE_API_URL"

if [ ! -f "$ENV_FILE" ]; then
    echo "❌ ERROR: .env file not found in the container!"
    exit 1
fi

for var in $REQUIRED_VARS; do
    # This searches the file for 'VAR_NAME=' followed by some text
    # It ignores lines that are just 'VAR_NAME=' with nothing after it
    if ! grep -qE "^$var=.+" "$ENV_FILE"; then
        echo "❌ ERROR: $var is missing or empty in .env"
        exit 1
    fi
done

for var in $PRESENT_VARS; do
    if ! grep -qE "^$var=" "$ENV_FILE"; then
        echo "❌ ERROR: $var is missing in .env"
        exit 1
    fi
done

GOOGLE_CLIENT_ID_VALUE=$(grep -E "^GOOGLE_CLIENT_ID=" "$ENV_FILE" | cut -d= -f2-)
GOOGLE_CLIENT_SECRET_VALUE=$(grep -E "^GOOGLE_CLIENT_SECRET=" "$ENV_FILE" | cut -d= -f2-)
FORTYTWO_CLIENT_ID_VALUE=$(grep -E "^FORTYTWO_CLIENT_ID=" "$ENV_FILE" | cut -d= -f2-)
FORTYTWO_CLIENT_SECRET_VALUE=$(grep -E "^FORTYTWO_CLIENT_SECRET=" "$ENV_FILE" | cut -d= -f2-)

echo "✅ Toutes les variables nécessaires sont présentes."

if [ "$GOOGLE_CLIENT_ID_VALUE" = "TODO_GOOGLE_CLIENT_ID" ] || [ "$GOOGLE_CLIENT_SECRET_VALUE" = "TODO_GOOGLE_CLIENT_SECRET" ]; then
    echo "⚠️  Mode local-demo : la connexion Google est indisponible tant que GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET ne sont pas réels."
fi

if [ "$FORTYTWO_CLIENT_ID_VALUE" = "TODO_FORTYTWO_CLIENT_ID" ] || [ "$FORTYTWO_CLIENT_SECRET_VALUE" = "TODO_FORTYTWO_CLIENT_SECRET" ]; then
    echo "⚠️  Mode local-demo : la connexion 42 est indisponible tant que FORTYTWO_CLIENT_ID/FORTYTWO_CLIENT_SECRET ne sont pas réels."
fi

exit 0
