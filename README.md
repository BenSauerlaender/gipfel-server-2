# gipfel-server-2

start database:
    docker-compose -f docker-compose-mongodb.yml up -d

start server:
    npm run dev


## TODO:
- change ascents Model and imports
    - remove aborted note
    - fix komma schreibweise
- Timeline
    - add Aborted, notes, solo, ... , new summit, new route
- ascents eintragen (ab 2017)