#!/bin/bash
curl "https://graph.facebook.com/v2.6/me/messenger_profile?fields=whitelisted_domains,home_url&access_token=$1"
