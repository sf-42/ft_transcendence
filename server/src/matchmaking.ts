import http, { userHttp } from "./utils/http"; // axios instance avec { withCredentials: true }

const SERVICE_TOKEN = process.env.SERVICE_TOKEN;

interface Game {
    id: number
    player1: string
    player2: string | null;
    powerup: string;
}

export async function createGameinDb(powerups: 0|1, player1: string, tournamentId?: number): Promise<number | null> 
{
	try 
    {
        if (tournamentId === undefined) {
            console.log("Creating game without tournament:", { powerups, player1 });
            const response = await http.post(`/games`, { powerups, player1 },
            {
                headers: {
                    'x-service-token': process.env.SERVICE_TOKEN || ''
                }
            });

            await userHttp.put(`/${player1}`, { currentGameId: response.data.id }, {
                headers: {
                    'x-service-token': process.env.SERVICE_TOKEN || ''
                }
            });
            return response.data.id;
        }
        else {
            console.log("Creating game with tournament:", { powerups, player1, tournamentId });
            const response = await http.post(`/games`, { powerups, player1, tournamentId },
            {
                headers: {
                    'x-service-token': process.env.SERVICE_TOKEN || ''
                }
            });

            await userHttp.put(`/${player1}`, { currentGameId: response.data.id }, {
                headers: {
                    'x-service-token': process.env.SERVICE_TOKEN || ''
                }
            });
            return response.data.id;
        }
	}
	catch (error) 
    {
		console.error("Server : error API request createGameinDB:", (error as any).message);
		return (null);
	}
}

export async function joinGameinDb(id:string, player2: string): Promise<Game | null>
{
    try
    {
        const response = await http.put<Game>(`/games/${id}/join`, { id, player2 } ,
        {
            headers: {
                'x-service-token': process.env.SERVICE_TOKEN || ''
            }
        });

        await userHttp.put(`/${player2}`, { currentGameId: id }, {
            headers: {
                'x-service-token': process.env.SERVICE_TOKEN || ''
            }
        });
        return response.data; 
    }
    catch (error)
    {
        console.error("Server : error API request joinGameinDB : ", (error as any).message);
        return (null);
    }
}

export async function leaveGameinDb(id:string, player: number, playerid: string): Promise<Game | null>
{
    try
    {
        const response = await http.put<Game>(`/games/${id}/leave`, { id, player},
        {
            headers: {
                'x-service-token': process.env.SERVICE_TOKEN || ''
            }
        });

        await userHttp.put(`/${player}`, { currentGameId: null }, {
            headers: {
                'x-service-token': process.env.SERVICE_TOKEN || ''
            }
        });
        return response.data;
    }
    catch (error)
    {
        console.error("Server : error API request leaveGameinDB: ", (error as any).message);
        return null;
    }
}

export async function putTournamentBracketinDb(tournamentId: number, bracket: number[][][]) : Promise<boolean>
{
    try
    {
        const response = await http.put(`/tournaments/${tournamentId}/bracket`, {id: tournamentId, bracket: bracket},
        {
            headers: {
                'x-service-token': process.env.SERVICE_TOKEN || ''
            }
        });
        return true;
    }
    catch (error)
    {
        console.error("Server: error API request putTournamentBracketinDb:", (error as any).message);
        return false;
    }
}

export async function destroyTournamentinDb(tournamentId: number, forced: boolean) : Promise<boolean>
{
    try
    {
        const response = await http.put(`/tournaments/${tournamentId}/destroy`, { forced: forced},
            {
                headers: {
                    'x-service-token': process.env.SERVICE_TOKEN || ''
                }
            });
        if (response.data.success)
            return true;
        else
            return false;
    }
    catch (error)
    {
        console.error("Server: error API request destroyTournamentinDb:", (error as any).message);
        return false;
    }
}

export async function putTournamentStatusinDb(tournamentId: number, status: string) : Promise<boolean>
{
    try
    {
        const response = await http.put(`/tournaments/${tournamentId}/status`, {status: status},
            {
                headers: {
                    'x-service-token': process.env.SERVICE_TOKEN || ''
                }
            });
        if (response.data.success)
            return true;
        else
            return false;
    }
    catch (error)
    {
        console.error("Server: error API request putTournamentStatusinDb", (error as any).message);
        return false;
    }
}