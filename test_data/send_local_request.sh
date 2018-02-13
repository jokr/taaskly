#!/bin/sh

curl -H "Content-Type: application/json" -d @test_data/$1.json http://:5000/api/webhook

