import AbstractView from "../utils/AbstractView.ts";
import { setPreviousPage, showHeader } from "../header.ts";
import { toggleBlur } from "../utils/babylonInit.ts";
import { getAllStats, getUserById, getUserByUsername, type User } from "../utils/usersManagement.ts";
import { navigateTo, player } from "../main.ts";
import { showNotification } from "../utils/ToastifyNotification.ts";
import { html } from "../utils/html.ts";
import { Player } from "../classes/Player.ts";
import type { LeaderboardEntry } from "./Statistics.ts";

export default class extends AbstractView {
	private _user: User | null = null;

	constructor() {
		super();
		this.setTitle(`Transcendence - Profile`);
	}

	async loadProfile(username?: string) {
		if (username)
			this._user = await getUserByUsername(username);
		else if (player)
			this._user = await getUserById(player.getAccountID());

		if (!this._user) {
			showNotification('Unable to get user', 'error');
			navigateTo('/home');
			return;
		}

		this.setTitle(`Transcendence - ${this._user.username}`);
	}

	async getHtml(): Promise<string> {
		toggleBlur(false);
		showHeader();
		setPreviousPage("/home");

		const colClass = "rounded-4xl border-8 border-solid border-white p-5 m-2 bg-black/10 animate-zoomin backdrop-blur-sm";

		return (`
            <div class="min-h-screen top-0 flex flex-col justify-center items-center p-4">
                <div class="w-[80%]">
                    <h2 id="profileName" class="text-center text-7xl mt-10 text-shadow-subtitle text-shadow-[#C16630]"></h2>
                    <div class="grid grid-cols-3 items-center">
                        <div class="${colClass} h-fit" id="profileInfo">
                        </div>
                        <div class="col-span-2 ${colClass}" id="profileStats">
                        </div>
                    </div>
                </div>
            </div>
        `);
	}

	async afterRender() {
		if (!this._user)
			return;

		const subTitleClass = "text-center text-xl sm:text-4xl xl:text-5xl";
		const spanClass = "text-md sm:text-2xl xl:text-4xl";

		const profileName = document.querySelector('#profileName');
		if (profileName)
			profileName.textContent = this._user.username;

		const profileInfo = document.getElementById('profileInfo');
		if (profileInfo) {
			const pictureUrl = this._user.profilePicture || Player.getIconPathBySkinId(this._user.avatar);
			profileInfo.appendChild(html`
				<div class="flex flex-col items-center">
					<img src="${pictureUrl}" class="w-fit max-h-28 xl:max-h-32 rounded-full" />
					<p class="${subTitleClass}">${this._user.username}</p>
				</div>
			`);
		}

		let gamesRanking = 0, tournamentsRanking = 0;
		const allStats = await getAllStats();

		if (allStats) {
			const gamesLeaderboard: LeaderboardEntry[] = Object.entries(allStats).sort(([, a], [, b]) => b["gamesWon"] - a["gamesWon"]).map(([username, result], index) => ({
				username,
				rank: index + 1,
				stats: result,
			}));

			for (const p of gamesLeaderboard) {
				if (p.username === this._user.username)
					gamesRanking = p.rank;
			}

			const tournamentLeaderboard: LeaderboardEntry[] = Object.entries(allStats).sort(([, a], [, b]) => b["tournamentWon"] - a["tournamentWon"]).map(([username, result], index) => ({
				username,
				rank: index + 1,
				stats: result,
			}));

			for (const p of tournamentLeaderboard) {
				if (p.username === this._user.username)
					tournamentsRanking = p.rank;
			}
		}
		
		const profileStats = document.getElementById('profileStats');
		if (profileStats) {
			profileStats.appendChild(html`
				<div class="flex items-center">
					<div class="w-1/2">
						<h4 class="${subTitleClass}">Simple Games</h4>
						<div class="text-center">
							<span class="${spanClass}">Games played: ${this._user.stats.gamesPlayed}</span>
						</div>
						<div class="text-center">
							<span class="${spanClass}">Games won: ${this._user.stats.gamesWon}</span>
						</div>
						${gamesRanking !== 0 
							? 
							`
							<div class="text-center">
								<span class="${spanClass}">Ranking: ${gamesRanking}</span>
							</div>
							`
							: ''
						}
					</div>
					<div class="w-1/2">
						<h4 class="${subTitleClass}">Tournaments</h4>
						<div class="text-center">
							<span class="${spanClass}" id="clientTournamentsPlayed">Tournaments played: ${this._user.stats.tournamentPlayed}</span>
						</div>
						<div class="text-center">
							<span class="${spanClass}" id="clientTournamentsWon">Tournaments won: ${this._user.stats.tournamentWon}</span>
						</div>
						${tournamentsRanking !== 0 
							? 
							`
							<div class="text-center">
								<span class="${spanClass}">Ranking: ${tournamentsRanking}</span>
							</div>
							`
							: ''
						}
					</div>
				</div>
			`);
		}
	}
}