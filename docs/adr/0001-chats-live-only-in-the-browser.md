# Chats live only in the Visitor's browser

Chats are saved in the Visitor's browser (IndexedDB) and the server keeps no state: each request carries the recent Messages it needs. We chose this over a server database with accounts because the app is a portfolio demo with no sign-in, the host (Vercel Functions) loses in-memory state between requests, and the old version leaked one shared conversation to every Visitor. The cost: Chats do not move between devices, and clearing site data deletes them.
