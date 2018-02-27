#!/bin/bash
curl -X POST -H "Content-Type: application/json" -d @config.json "https://graph.facebook.com/v2.6/me/messenger_profile?access_token=$1"
