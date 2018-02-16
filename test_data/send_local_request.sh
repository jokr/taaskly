#!/bin/sh

curl -H "Content-Type: application/json" -d @test_data/$2.json http://:5000/api/$1
