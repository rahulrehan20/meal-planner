# Meal Planner

A small shared weekly meal planner that runs with plain HTML, CSS, JavaScript, and PHP. It stores data in a JSON file inside this project folder, so devices on the same internal network can see and update the same planner.

## Features

- Weekly planner grid with days as rows and Breakfast, Lunch, Dinner as columns.
- Current week opens by default.
- Previous and next buttons move between weeks.
- Add meals from the `+` button.
- Click any meal slot to assign or clear a saved meal.
- Shared data is saved in `data/meal-planner.json`.

## Run Locally

From this folder:

```bash
php -S 0.0.0.0:8000
```

Open on the same machine:

```text
http://localhost:8000
```

Open from another device on your internal network:

```text
http://YOUR_COMPUTER_IP:8000
```

For example, if this computer's IP is `192.168.1.25`, open:

```text
http://192.168.1.25:8000
```

## Find Your IP Address

On Linux:

```bash
hostname -I
```

Use the IP address that belongs to your Wi-Fi or LAN network.

## Data File

The app creates this file automatically:

```text
data/meal-planner.json
```

Keep this folder writable by the user running PHP. If saving fails, check folder permissions and restart the PHP server.

## Notes

- The app needs PHP only because browsers cannot write shared data back into a project folder by themselves.
- Do not open `index.html` directly with `file://` if you want shared data. Use the PHP command above.
- Everyone using the app has edit access. There is no login or permission system.
