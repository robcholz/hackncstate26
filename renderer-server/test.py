import requests
import multiprocessing

url = 'http://127.0.0.1:8000/api/v1/render'
myobj = {'url': 'http://apple.com', 'timeout':3000}


def test():
    x = requests.post(url, json = myobj)
    print(x.text)



if __name__ == '__main__':
    processes = []

    for i in range(4):
        process = multiprocessing.Process(target=test)
        process.start()
        processes.append(process)

    for process in processes:
        process.join()