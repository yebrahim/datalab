#! /usr/bin/python
import sys, datetime
import subprocess

def write_stdout(s):
  sys.stdout.write(s)
  sys.stdout.flush()

def write_stderr(s):
  sys.stderr.write(s)
  sys.stderr.flush()

def main(args):
  while 1:
    write_stdout('READY\n') # transition from ACKNOWLEDGED to READY
    line = sys.stdin.readline()  # read header line from stdin
    headers = dict([ x.split(':') for x in line.split() ])
    data = sys.stdin.read(int(headers['len']))
    write_stderr('line: ' + line + data + '\n')
    with open('tmp/date.log', 'a') as f:
      f.write(str(datetime.datetime.now()) + '\n')
    write_stdout('RESULT 2\nOK') # transition from READY to ACKNOWLEDGED

if __name__ == '__main__':
  main(sys.argv[1:])
  import sys
