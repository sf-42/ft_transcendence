import AbstractView from "../utils/AbstractView.ts";
import { setPreviousPage, showHeader } from '../header.ts';
import { toggleBlur } from "../utils/babylonInit.ts";
import { html } from "../utils/html.ts";
import { getAllStats, getUserByUsername, getUserStats } from "../utils/usersManagement.ts";
import type { Stats } from "../utils/usersManagement.ts";
import { player } from "../main.ts";
import { showNotification } from "../utils/ToastifyNotification.ts";
import { Player } from "../classes/Player.ts";

enum StatsType { GAMES = "games", TOURNAMENTS = "tournaments" }
const divClass = "rounded-4xl border-8 border-solid border-white p-5 m-2 w-[75%] bg-black/10 animate-zoomin backdrop-blur-sm";
const titleClass = "text-center text-4xl xl:text-5xl";
const subTitleClass = "text-center text-xl sm:text-3xl xl:text-4xl";
const spanClass = "text-md sm:text-xl xl:text-3xl";

export interface LeaderboardEntry {
	username: string;
	rank: number;
	stats: Stats;
}

export default class extends AbstractView {
	private _activeTab: StatsType = StatsType.GAMES;

	constructor() {
		super();
		this.setTitle("Transcendence - Statistics");
	}

	async getHtml(): Promise<string> {
		toggleBlur(false);
		showHeader();
		setPreviousPage("/home");

		return (`
			<div class="w-full top-0 flex flex-col justify-center items-center p-1 sm:p-4 justify-center items-center">
				<h2 class="text-center text-7xl mt-16 sm:mt-10 text-shadow-subtitle text-shadow-[#C16630]">Statistics</h2>
				<div class="${divClass}" id="clientStats">
					<h3 class="${titleClass}">You - ${player?.getUsername()}</h3>
				</div>
				<div class="${divClass}">
					<h3 class="${titleClass}">Leaderboard</h3>
					<div class="flex mb-2">
						<div id="simpleGamesTitle" class="w-1/2 underline decoration-4 underline-offset-4 cursor-pointer">
							<h4 class="${subTitleClass}">Simple Games</h4>
						</div>
						<div id="tournamentsTitle" class="w-1/2 decoration-4 underline-offset-4 cursor-pointer">
							<h4 class="${subTitleClass}">Tournaments</h4>
						</div>
					</div>
					<div id="leaderboardContent">
					</div>
				</div>
				<div class="${divClass}">
					<h3 class="${titleClass}">Find someone's statistics</h3>
					<div class="flex flex-col items-center justify-center">
						<form id="search-userstats" class="flex gap-2 my-2">
							<input type="text" id="username" name="username" placeholder="Enter a username" 
								class="bg-white/20 border border-grey-500 text-lg md:text-xl rounded-lg focus:ring-white focus:border-white block w-full p-2.5" required />
							<button type="submit" id="searchStatsBtn" class="border border-white border-4 rounded-lg bg-white/10 text-md md:text-lg p-1 px-2 transition-colors hover:scale-110 hover:bg-white/20 transition-shadow hover:shadow-[inset_0_0_15px_2px_rgba(255,255,255,0.5)] cursor-pointer">
								Search
							</button>
						</form>
					</div>
					<div id="searchResult">
					</div>
				</div>
			</div>
		`);
	}

	private renderClientStats(): void {
		const element = document.getElementById("clientStats");
		let clientStats: Stats = {
			gamesPlayed: -1,
			gamesWon: -1,
			tournamentPlayed: -1,
			tournamentWon: -1
		};

		if (element && player) {
			getUserStats().then((result) => {
				if (result)
					clientStats = result;
				element.appendChild(html`
					<div class="flex">
						<div class="w-1/2">
							<h4 class="${subTitleClass}">Simple Games</h4>
							<div class="text-center">
								<span class="${spanClass}" id="clientGamesPlayed">Games played: ${clientStats.gamesPlayed}</span>
							</div>
							<div class="text-center">
								<span class="${spanClass}" id="clientGamesWon">Games won: ${clientStats.gamesWon}</span>
							</div>
						</div>
						<div class="w-1/2">
							<h4 class="${subTitleClass}">Tournaments</h4>
							<div class="text-center">
								<span class="${spanClass}" id="clientTournamentsPlayed">Tournaments played: ${clientStats.tournamentPlayed}</span>
							</div>
							<div class="text-center">
								<span class="${spanClass}" id="clientTournamentsWon">Tournaments won: ${clientStats.tournamentWon}</span>
							</div>
						</div>
					</div>
				`);
			});
		}
	}

	private changeActiveLeaderboard(type: StatsType): void {
		if (type === this._activeTab)
			return;

		const simpleGamesTitle = document.getElementById('simpleGamesTitle');
		const tournamentsTitle = document.getElementById('tournamentsTitle');

		this._activeTab = type;

		if (type === StatsType.GAMES) {
			simpleGamesTitle?.classList.add('underline');
			tournamentsTitle?.classList.remove('underline');
		}
		else {
			simpleGamesTitle?.classList.remove('underline');
			tournamentsTitle?.classList.add('underline');
		}
		this.renderLeaderboard();
	}

	private renderLeaderboard(): void {
		const txtClass = "text-md sm:text-xl xl:text-3xl text-center";
		const leaderboardElem = document.getElementById('leaderboardContent');
		const statsCategory = (this._activeTab === StatsType.GAMES) ? "Games" : "Tournaments";

		if (!leaderboardElem) {
			console.error("Could not get leaderboard element.");
			return;
		}

		leaderboardElem.innerHTML = "";

		getAllStats().then((result) => {
			if (!result) {
				console.error("Error while getting stats from DB");
				return;
			}
			if (Object.keys(result).length === 0) {
				showNotification("No statistics found.", "error");
				return;
			}

			const sortBy: keyof Stats = this._activeTab === StatsType.GAMES ? "gamesWon" : "tournamentWon";
			const leaderboard: LeaderboardEntry[] = Object.entries(result).sort(([, a], [, b]) => b[sortBy] - a[sortBy]).map(([username, result], index) => ({
				username,
				rank: index + 1,
				stats: result,
			}));

			let clientFound: boolean = false;

			leaderboard.slice(0, 10).forEach(entry => {
				let txtColor = "text-white";
				if (entry.rank === 1)
					txtColor = "text-gold";
				else if (entry.rank === 2)
					txtColor = "text-silver";
				else if (entry.rank === 3)
					txtColor = "text-bronze";

				if (entry.username === player?.getUsername()) {
					txtColor += " rounded-lg bg-white/10";
					clientFound = true;
				}

				const played: number = this._activeTab === StatsType.GAMES ? entry.stats.gamesPlayed : entry.stats.tournamentPlayed;
				const won: number = this._activeTab === StatsType.GAMES ? entry.stats.gamesWon : entry.stats.tournamentWon;

				leaderboardElem.appendChild(html `
					<div class="grid grid-cols-3 items-center ${txtClass} ${txtColor}">
						<p>${entry.rank.toString()}. ${entry.username}</p>
						<p>${statsCategory} played: ${played.toString()}</p>
						<p>${statsCategory} won: ${won.toString()}</p>
					</div>
				`);
			});

			if (!clientFound && player) {
				const clientStats = leaderboard.find((LeaderboardEntry) => { LeaderboardEntry.username === player?.getUsername() });
				if (clientStats) {
					const played: number = this._activeTab === StatsType.GAMES ? clientStats.stats.gamesPlayed : clientStats.stats.tournamentPlayed;
					const won: number = this._activeTab === StatsType.GAMES ? clientStats.stats.tournamentPlayed : clientStats.stats.tournamentWon;

					leaderboardElem.appendChild(html `
						<div class="grid grid-cols-3 items-center ${txtClass} rounded-lg bg-white/10">
							<p>${clientStats.rank.toString()}. ${clientStats.username}</p>
							<p>${statsCategory} played: ${played.toString()}</p>
							<p>${statsCategory} won: ${won.toString()}</p>
						</div>
					`);
				}
			}
		});
	}

	async searchUserStats() {
		const username = (document.getElementById('username') as HTMLInputElement).value;
		if (!username) {
			showNotification('The input field is empty', 'error');
			return;
		}
		
		const statsDiv = document.getElementById('searchResult');
		if (!statsDiv) {
			console.error('Could not get search result element');
			return;
		}

		try {
			const res = await getUserByUsername(username);

			statsDiv.innerHTML = '';

			if (!res) {
				statsDiv.appendChild(html `
					<p class="text-center text-lg md:text-xl text-gray-400">No result found.</p>
				`);
				return;
			}

			statsDiv.appendChild(html`
				<div>
					<div class="flex justify-center">
						<div class="flex items-center m-2 gap-2">
							<img src="${res.profilePicture || Player.getIconPathBySkinId(res.avatar)}" class="max-w-10 md:max-w-14 lg:max-w-16 rounded-full bg-white/10" />
							<h4 class="${subTitleClass}">${res.username}'s statistics</h4>
						</div>
					</div>
					<div class="flex">
						<div class="w-1/2">
							<h4 class="${subTitleClass}">Simple Games</h4>
							<div class="text-center">
								<span class="${spanClass}" id="clientGamesPlayed">Games played: ${res.stats.gamesPlayed}</span>
							</div>
							<div class="text-center">
								<span class="${spanClass}" id="clientGamesWon">Games won: ${res.stats.gamesWon}</span>
							</div>
						</div>
						<div class="w-1/2">
							<h4 class="${subTitleClass}">Tournaments</h4>
							<div class="text-center">
								<span class="${spanClass}" id="clientTournamentsPlayed">Tournaments played: ${res.stats.tournamentPlayed}</span>
							</div>
							<div class="text-center">
								<span class="${spanClass}" id="clientTournamentsWon">Tournaments won: ${res.stats.tournamentWon}</span>
							</div>
						</div>
					</div>
				</div>
			`);
		} catch (error) {
			console.error('Failed to get user stats:', (error as any).message || error);
		}
	}

	afterRender(): void {
		this.renderClientStats();
		this.renderLeaderboard();

		const simpleGamesTitle = document.getElementById('simpleGamesTitle');
		const tournamentsTitle = document.getElementById('tournamentsTitle');

		simpleGamesTitle?.addEventListener('click', (e: MouseEvent) => {
			e.preventDefault();
			this.changeActiveLeaderboard(StatsType.GAMES);
		});
		tournamentsTitle?.addEventListener('click', (e: MouseEvent) => {
			e.preventDefault();
			this.changeActiveLeaderboard(StatsType.TOURNAMENTS);
		});

		const searchForm = document.getElementById('search-userstats');
		if (searchForm) {
			searchForm.addEventListener("submit", (e) => {
				e.preventDefault();
				this.searchUserStats();
			})
		}
	}
}