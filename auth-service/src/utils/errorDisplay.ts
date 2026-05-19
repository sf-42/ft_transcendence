import { FastifyRequest, FastifyReply } from 'fastify';


// Display function for errors. Return the reply
export async function returnError(request: FastifyRequest, reply: FastifyReply, message: string, statusCode: number) {
    request.log.error({ message });
    return reply.status(statusCode).send({
        success: false,
        message: message,
    });

}

// Same shape helpers for other log levels
export async function returnInfo(request: FastifyRequest, reply: FastifyReply, message: string, statusCode: number) {
    request.log.info({ message });
    return reply.status(statusCode).send({
        success: false,
        message,
    });
}

export async function returnWarn(request: FastifyRequest, reply: FastifyReply, message: string, statusCode: number) {
    request.log.warn({ message });
    return reply.status(statusCode).send({
        success: false,
        message,
    });
}

export async function returnDebug(request: FastifyRequest, reply: FastifyReply, message: string, statusCode: number) {
    request.log.debug({ message });
    return reply.status(statusCode).send({
        success: false,
        message,
    });
}
