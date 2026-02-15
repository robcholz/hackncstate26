import requests
import multiprocessing
from main import main
import subprocess
import time

url = 'http://127.0.0.1:8000/api/v1/render'
myobj = {'url': 'http://apple.com', 'timeout':3000}




def test():
    x = requests.post(url, json = myobj)
    print(x.text)



if __name__ == '__main__':
    subprocess.Popen(["fastapi", "dev", "main.py"])
    time.sleep(5)
    print("d")
    processes = []

    for i in range(4):
        process = multiprocessing.Process(target=test)
        process.start()
        print("working")
        processes.append(process)

    for process in processes:
        process.join()