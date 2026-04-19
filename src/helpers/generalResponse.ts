const generalResponse = (response: any, data: any = null, message = '', response_type: 'success' | 'error', statusCode = 200) => {
  response.status(statusCode).send({
    meta: {
      message: message,
      success: response_type === 'success' ? true : false,
      status: statusCode,
    },
    data: data,
  });
};
export default generalResponse;
